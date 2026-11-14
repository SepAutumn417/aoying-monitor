package com.aoying.aoying_monitor.monitor

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import com.aoying.aoying_monitor.pure.*
import okhttp3.Call
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

/** The only native WSS owner. Not Activity-bound, not boot-started, no delivery guarantee. */
class BackgroundMonitorService : Service() {
    companion object { const val ACTION_STOP = "com.aoying.monitor.STOP" }
    private lateinit var runtime: MonitorRuntime
    private val serial = ScheduledThreadPoolExecutor(1).apply { removeOnCancelPolicy = true }
    private val connectionId = AtomicLong()
    private val queuedFrames = AtomicInteger()
    private val policy = MonitorPolicy()
    @Volatile var isActive = false
        private set
    @Volatile private var socket: WebSocket? = null
    @Volatile private var ticketCall: Call? = null
    private var epoch = 0L
    private var scope = ""
    private var attempts = 0
    private var authCloses = 0
    private var reducer: ReplayReducer? = null
    private var helloSeen = false
    private var heartbeat: Heartbeat? = null

    override fun onCreate() { super.onCreate(); runtime = MonitorRuntime.get(this) }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { runtime.userStop(); stopSelf(); return START_NOT_STICKY }
        if (isActive) return START_NOT_STICKY
        if (intent == null || !runtime.acceptedService(this) || !runtime.permissionsUsable()) { stopSelf(); return START_NOT_STICKY }
        try {
            val notification = runtime.notifications.ongoing("connecting")
            if (Build.VERSION.SDK_INT >= 34) startForeground(MonitorNotifications.ONGOING_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
            else startForeground(MonitorNotifications.ONGOING_ID, notification)
            epoch = runtime.auth.generation()
            scope = runtime.store.scope(runtime.auth.current() ?: throw AuthFailure("no_session"))
            isActive = true
            runtime.connection("connecting")
            serial.execute { connect() }
            serial.scheduleAtFixedRate({ tick() }, 5L, 5L, TimeUnit.SECONDS)
        } catch (_: Exception) { runtime.connection("stopped", "service_start_failed"); stopSelf() }
        return START_NOT_STICKY
    }
    private fun dispatch(block: () -> Unit) { try { serial.execute(block) } catch (_: RejectedExecutionException) { /* destroyed */ } }
    private fun valid(id: Long): Boolean = isActive && connectionId.get() == id && runtime.auth.generation() == epoch
    private fun connect() {
        if (!isActive || runtime.auth.generation() != epoch) return
        val id = connectionId.incrementAndGet()
        try {
            if (!runtime.permissionsUsable()) { halt("notifications_disabled"); return }
            var session = runtime.auth.current() ?: throw AuthFailure("no_session")
            if (session.expiresAt <= System.currentTimeMillis() + 30_000L) session = runtime.auth.refresh(session.access) ?: throw AuthFailure("unauthenticated")
            var retried = false
            var ticket: JSONObject? = null
            while (ticket == null) {
                if (!valid(id)) return
                try {
                    val call = runtime.http.ticketCall(session)
                    ticketCall = call
                    ticket = runtime.http.execute(call)
                    ticketCall = null
                    break
                } catch (error: AuthFailure) {
                    if (error.code != "unauthenticated" || retried) throw error
                    retried = true
                    session = runtime.auth.refresh(session.access) ?: throw AuthFailure("unauthenticated")
                }
            }
            if (!valid(id)) return
            val ticketData = ticket ?: throw AuthFailure("invalid_response")
            val url = SecureOrigin.validateSocket(session.origin, ticketData.getString("ws_url"))
            reducer = ReplayReducer(runtime.store.cursor(scope))
            helloSeen = false
            heartbeat = Heartbeat(SystemClock.elapsedRealtime())
            // Default platform TLS/hostname checks remain intact; URL is never logged or broadcast.
            socket = runtime.http.client.newWebSocket(Request.Builder().url(url).build(), listener(id))
        } catch (error: AuthFailure) {
            if (valid(id)) {
                if (error.code in setOf("unauthenticated", "no_session", "secure_storage_failed", "session_changed")) halt("auth_required")
                else retry(id, "network_unavailable")
            } else if (isActive && runtime.auth.current() == null) halt("auth_required")
        } catch (_: Exception) { if (valid(id)) retry(id, "network_unavailable") }
        finally { ticketCall = null }
    }
    private fun listener(id: Long) = object : WebSocketListener() {
        override fun onMessage(webSocket: WebSocket, text: String) {
            if (!valid(id)) return
            if (text.length > 262_144 || queuedFrames.incrementAndGet() > 128) {
                if (text.length <= 262_144) queuedFrames.decrementAndGet()
                webSocket.cancel(); dispatch { retry(id, "backpressure_resync") }; return
            }
            dispatch {
                try {
                    if (valid(id)) frame(webSocket, text)
                } catch (error: AuthFailure) {
                    if (valid(id)) halt(if (error.code == "session_changed") "auth_required" else error.code)
                } catch (error: IllegalStateException) {
                    if (valid(id)) {
                        if (error.message == "ledger_rewound") halt("ledger_rewound") else retry(id, "protocol_resync")
                    }
                } catch (_: Exception) { if (valid(id)) retry(id, "protocol_resync") }
                finally { queuedFrames.decrementAndGet() }
            }
        }
        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(code, null) }
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { dispatch {
            if (valid(id)) {
                if (code == 4401 || code == 4403) {
                    authCloses++
                    if (authCloses >= 2) halt("auth_required") else retry(id, "authentication_retry")
                } else retry(id, "network_unavailable")
            }
        } }
        override fun onFailure(webSocket: WebSocket, error: Throwable, response: Response?) { dispatch {
            if (valid(id)) {
                if (response?.code == 401 || response?.code == 403) halt("auth_required") else retry(id, "network_unavailable")
            }
        } }
    }
    private fun event(data: JSONObject): StreamEvent {
        val id = data.getLong("id")
        check(id > 0)
        return StreamEvent(id, data.getString("kind"), data.optJSONObject("payload")?.asMap() ?: emptyMap(), data.optString("created_at", ""))
    }
    private fun frame(webSocket: WebSocket, text: String) {
        val data = JSONObject(text)
        val state = reducer ?: throw IllegalStateException("No reducer")
        when (data.getString("type")) {
            "hello" -> {
                val cursor = state.hello(data.getLong("last_event_id"))
                helloSeen = true
                runtime.consume(epoch, scope, emptyList(), cursor)
                check(webSocket.send(JSONObject().put("type", "hello").put("protocol_version", 2).put("last_event_id", cursor).toString()))
            }
            "event" -> {
                val deliveries = state.live(event(data.getJSONObject("event")))
                if (helloSeen) runtime.consume(epoch, scope, deliveries, state.cursor)
            }
            "replay" -> {
                val array = data.getJSONArray("events")
                check(array.length() <= 100 && data.getInt("count") == array.length())
                val events = (0 until array.length()).map { event(array.getJSONObject(it)) }
                check(events.isEmpty() || data.getLong("next_cursor") == events.last().id)
                val deliveries = state.replay(events, data.getLong("watermark"))
                runtime.consume(epoch, scope, deliveries, state.cursor)
            }
            "replay_complete" -> {
                val deliveries = state.complete(data.getLong("last_event_id"))
                runtime.consume(epoch, scope, deliveries, state.cursor)
                attempts = 0; authCloses = 0
                runtime.connection("live")
                runtime.notifications.updateOngoing("live")
            }
            "pong" -> heartbeat?.pong(SystemClock.elapsedRealtime())
            "error" -> throw IllegalStateException("Protocol rejected")
            else -> throw IllegalStateException("Unknown frame")
        }
    }
    private fun tick() {
        if (!isActive) return
        try {
            if (runtime.auth.generation() != epoch) { halt("auth_required"); return }
            if (!runtime.permissionsUsable()) { halt("notifications_disabled"); return }
            val timer = heartbeat ?: return
            val current = socket ?: return
            val now = SystemClock.elapsedRealtime()
            if (timer.expired(now)) { retry(connectionId.get(), "pong_timeout"); return }
            if (timer.ping(now) && !current.send("{\"type\":\"ping\"}")) retry(connectionId.get(), "network_unavailable")
        } catch (_: Exception) { halt("service_error") }
    }
    private fun retry(id: Long, detail: String) {
        if (!valid(id)) return
        connectionId.incrementAndGet()
        socket?.cancel(); socket = null
        ticketCall?.cancel(); ticketCall = null
        heartbeat = null; reducer = null
        runtime.connection("reconnecting", detail)
        try { runtime.notifications.updateOngoing("reconnecting") } catch (_: Exception) { halt("notifications_disabled"); return }
        serial.schedule({ connect() }, policy.reconnectDelay(attempts++, Math.random()), TimeUnit.MILLISECONDS)
    }
    private fun halt(reason: String) {
        stopTransport()
        runtime.connection("stopped", reason)
        stopSelf()
    }
    /** Can be invoked synchronously by logout before revoke/network work. */
    fun stopTransport() {
        isActive = false
        connectionId.incrementAndGet()
        ticketCall?.cancel(); ticketCall = null
        socket?.cancel(); socket = null
        serial.shutdownNow()
    }
    override fun onDestroy() {
        stopTransport()
        stopForeground(STOP_FOREGROUND_REMOVE)
        runtime.serviceDestroyed(this)
        super.onDestroy()
    }
}
