package com.aoying.aoying_monitor.pure

import java.net.URI
import kotlin.math.pow

class MonitorPolicy {
    fun startReason(explicit: Boolean, userStopped: Boolean, visible: Boolean, session: Boolean, permission: Boolean, globalNotifications: Boolean, statusChannel: Boolean, signalChannel: Boolean): String = when {
        userStopped && !explicit -> "user_stopped"
        !session -> "no_session"
        !visible -> "not_visible"
        !permission -> "notification_permission_denied"
        !globalNotifications -> "notifications_disabled"
        !statusChannel -> "status_channel_disabled"
        !signalChannel -> "signal_channel_disabled"
        else -> ""
    }
    fun uiVisible(requested: Boolean, resumed: Boolean, interactive: Boolean, locked: Boolean): Boolean = requested && resumed && interactive && !locked
    fun reconnectDelay(attempt: Int, random: Double): Long = (1000.0 * 2.0.pow(attempt.coerceIn(0, 5)) * (0.8 + random.coerceIn(0.0, 1.0) * 0.4)).toLong().coerceIn(1000L, 30000L)
}
class Heartbeat(start: Long) {
    private var lastPong = start
    private var lastPing = start
    fun pong(now: Long) { lastPong = now }
    fun ping(now: Long): Boolean {
        if (now - lastPing < 25000L) return false
        lastPing = now
        return true
    }
    fun expired(now: Long): Boolean = now - lastPong >= 75000L
}
object SecureOrigin {
    fun normalize(base: String): String {
        val uri = URI(base.trim())
        require(uri.scheme.equals("https", true) && !uri.host.isNullOrBlank() && uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null && (uri.rawPath.isNullOrEmpty() || uri.rawPath == "/")) { "invalid_origin" }
        require(uri.port in -1..65535 && uri.port != 0) { "invalid_origin" }
        return URI("https", null, uri.host.lowercase(), if (uri.port == 443) -1 else uri.port, null, null, null).toASCIIString()
    }
    fun validateSocket(origin: String, url: String): String {
        val base = URI(normalize(origin))
        val socket = URI(url)
        require(socket.scheme == "wss" && socket.host.equals(base.host, true) && socket.rawUserInfo == null && socket.rawFragment == null && socket.rawPath == "/ws") { "invalid_socket_origin" }
        require((if (socket.port == -1) 443 else socket.port) == (if (base.port == -1) 443 else base.port)) { "invalid_socket_origin" }
        require(!socket.rawQuery.isNullOrBlank()) { "missing_ticket" }
        return url
    }
}
