package com.aoying.aoying_monitor.pure

interface MonitorPreferences {
    var userStopped: Boolean
}
/** Independent of Activity disposal; explicit user-stop is distinct from account logout. */
class MonitorLifecycle(private val preferences: MonitorPreferences, private val stopTransport: () -> Unit, private val stopService: () -> Unit, private val clearAccountData: () -> Unit) {
    fun userStop() {
        preferences.userStopped = true
        stopTransport()
        stopService()
    }
    fun logout() {
        stopTransport()
        stopService()
        clearAccountData()
    }
    fun enable(explicit: Boolean): Boolean {
        if (explicit) preferences.userStopped = false
        return !preferences.userStopped
    }
}
