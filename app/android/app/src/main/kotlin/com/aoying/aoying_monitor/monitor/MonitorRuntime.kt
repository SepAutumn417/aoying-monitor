package com.aoying.aoying_monitor.monitor

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import com.aoying.aoying_monitor.pure.*
import io.flutter.plugin.common.EventChannel
import java.util.concurrent.Executors

/** Process singleton: Activity/Flutter engines are subscribers, never socket or refresh owners. */
class MonitorRuntime private constructor(private val context: Context) {
    companion object {
        @Volatile private var instance: MonitorRuntime? = null
        fun get(context: Context): MonitorRuntime = instance ?: synchronized(this) {
            instance ?: MonitorRuntime(context.applicationContext).also { instance = it }
        }
    }
    val http = NativeHttp()
    val auth = AuthRepository(EncryptedSessionStore(context), http)
    val store = MonitorStore(context)
    val notifications = MonitorNotifications(context)
    val worker = Executors.newFixedThreadPool(2)
    private val main = Handler(Looper.getMainLooper())
    private val policy = MonitorPolicy()
    private val accountGuard = Any()
    @Volatile private var resumedOwner: Any? = null
    @Volatile private var requestedVisible = false
    @Volatile private var service: BackgroundMonitorService? = null
    @Volatile private var pendingStart = false
    @Volatile private var connection = "idle"
    @Volatile private var reason = ""
    private var sinkOwner: Any? = null
    private var sink: EventChannel.EventSink? = null
    private val lifecycle = MonitorLifecycle(store,
        { service?.stopTransport() },
        { context.stopService(Intent(context, BackgroundMonitorService::class.java)); pendingStart = false; connection = "stopped" },
        { try { store.clearCursors() } finally { notifications.clearAccountNotifications() } })

    init { notifications.createChannels() }
    fun activityResumed(owner: Any, resumed: Boolean) {
        if (resumed) { resumedOwner = owner; requestedVisible = false }
        else if (resumedOwner === owner) { resumedOwner = null; requestedVisible = false }
    }
    fun visibility(owner: Any, visible: Boolean) { if (resumedOwner === owner) requestedVisible = visible }
    fun activityVisible(): Boolean = policy.uiVisible(true, resumedOwner != null,
        context.getSystemService(PowerManager::class.java).isInteractive,
        context.getSystemService(KeyguardManager::class.java).isKeyguardLocked)
    fun uiVisible(): Boolean = policy.uiVisible(requestedVisible, resumedOwner != null,
        context.getSystemService(PowerManager::class.java).isInteractive,
        context.getSystemService(KeyguardManager::class.java).isKeyguardLocked)
    fun attachEvents(owner: Any, events: EventChannel.EventSink) {
        sinkOwner = owner; sink = events
        events.success(mapOf("type" to "status", "status" to status()))
    }
    fun detachEvents(owner: Any) { if (sinkOwner === owner) { sink = null; sinkOwner = null } }
    fun publishStatus() { main.post { sink?.success(mapOf("type" to "status", "status" to status())) } }
    fun status(): Map<String, Any?> {
        val permission = notifications.permission()
        val global = notifications.globalEnabled()
        val statusChannel = notifications.channelEnabled(MonitorNotifications.STATUS)
        val signalChannel = notifications.channelEnabled(MonitorNotifications.SIGNAL)
        val blocked = when {
            !permission -> "notification_permission_denied"
            !global -> "notifications_disabled"
            !statusChannel -> "status_channel_disabled"
            !signalChannel -> "signal_channel_disabled"
            else -> ""
        }
        return mapOf("supported" to true,
            "enabled" to (service?.isActive == true && blocked.isEmpty() && auth.current() != null),
            "notificationPermission" to permission, "notificationsEnabled" to (global && statusChannel && signalChannel),
            "batteryUnrestricted" to context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName),
            "connection" to connection, "reason" to (if (blocked.isNotEmpty()) blocked else reason))
    }
    fun rejected(code: String): Map<String, Any?> { reason = code; publishStatus(); return status() }
    fun start(explicit: Boolean): Map<String, Any?> = synchronized(accountGuard) {
        val blocked = policy.startReason(explicit, store.userStopped, activityVisible(), auth.current() != null,
            notifications.permission(), notifications.globalEnabled(), notifications.channelEnabled(MonitorNotifications.STATUS), notifications.channelEnabled(MonitorNotifications.SIGNAL))
        if (blocked.isNotEmpty()) return@synchronized rejected(blocked)
        lifecycle.enable(explicit)
        if (service?.isActive == true || pendingStart) return@synchronized status()
        pendingStart = true; connection = "connecting"; reason = "service_starting"
        try {
            val intent = Intent(context, BackgroundMonitorService::class.java)
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
        } catch (_: Exception) { pendingStart = false; connection = "stopped"; reason = "service_start_failed" }
        publishStatus()
        status()
    }
    fun userStop(): Map<String, Any?> = synchronized(accountGuard) {
        try { lifecycle.userStop() } finally { service?.stopTransport(); context.stopService(Intent(context, BackgroundMonitorService::class.java)); pendingStart = false; connection = "stopped"; reason = "user_stopped"; publishStatus() }
        status()
    }
    /** Synchronous handler boundary. Network revocation is deliberately not part of this method. */
    fun logout(): Session? = synchronized(accountGuard) {
        try { auth.logout() } finally { lifecycle.logout(); reason = "no_session"; publishStatus() }
    }
    fun beginLogin(): Long = synchronized(accountGuard) {
        try { auth.beginLogin() } finally { lifecycle.logout(); reason = "no_session"; publishStatus() }
    }
    fun acceptedService(value: BackgroundMonitorService): Boolean = synchronized(accountGuard) {
        if (!pendingStart || store.userStopped || auth.current() == null) return@synchronized false
        service = value; pendingStart = false; reason = ""; true
    }
    fun serviceDestroyed(value: BackgroundMonitorService) {
        synchronized(accountGuard) {
            if (service === value) { service = null; pendingStart = false; connection = "stopped" }
        }
        publishStatus()
    }
    fun connection(value: String, detail: String = "") { connection = value; reason = detail; publishStatus() }
    fun permissionsUsable(): Boolean = notifications.permission() && notifications.globalEnabled() && notifications.channelEnabled(MonitorNotifications.STATUS) && notifications.channelEnabled(MonitorNotifications.SIGNAL)
    fun consume(epoch: Long, scope: String, deliveries: List<Delivery>, cursor: Long) = synchronized(accountGuard) {
        if (auth.generation() != epoch || service?.isActive != true) throw AuthFailure("session_changed")
        if (!permissionsUsable()) throw AuthFailure("notifications_disabled")
        for (delivery in deliveries) {
            if (delivery.audible && SignalNotificationPolicy().accepts(delivery.event.kind) && !uiVisible()) notifications.signal(scope, delivery.event)
        }
        store.saveCursor(scope, cursor)
        for (delivery in deliveries) {
            val event = delivery.event
            main.post {
                if (auth.generation() == epoch) sink?.success(mapOf("type" to "event", "event" to mapOf("id" to event.id, "kind" to event.kind, "payload" to event.payload, "created_at" to event.createdAt)))
            }
        }
    }
}
