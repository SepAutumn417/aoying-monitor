package com.aoying.aoying_monitor.monitor

import android.content.Context
import com.aoying.aoying_monitor.pure.AuthFailure
import com.aoying.aoying_monitor.pure.MonitorPreferences
import com.aoying.aoying_monitor.pure.Session
import java.security.MessageDigest

class MonitorStore(context: Context) : MonitorPreferences {
    private val settings = context.getSharedPreferences("native_monitor_settings", Context.MODE_PRIVATE)
    private val cursors = context.getSharedPreferences("native_monitor_cursors", Context.MODE_PRIVATE)
    override var userStopped: Boolean
        get() = settings.getBoolean("user_stopped", false)
        set(value) { if (!settings.edit().putBoolean("user_stopped", value).commit()) throw AuthFailure("secure_storage_failed") }
    fun scope(session: Session): String {
        val user = session.user["id"] ?: throw AuthFailure("invalid_session")
        val device = session.device["id"] ?: throw AuthFailure("invalid_session")
        val identity = "${session.origin}|$user|$device"
        return MessageDigest.getInstance("SHA-256").digest(identity.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }
    fun cursor(scope: String): Long? = if (cursors.contains(scope)) cursors.getLong(scope, 0L) else null
    fun saveCursor(scope: String, cursor: Long) {
        if (!cursors.edit().putLong(scope, cursor).commit()) throw AuthFailure("cursor_storage_failed")
    }
    fun clearCursors() { if (!cursors.edit().clear().commit()) throw AuthFailure("cursor_storage_failed") }
}
