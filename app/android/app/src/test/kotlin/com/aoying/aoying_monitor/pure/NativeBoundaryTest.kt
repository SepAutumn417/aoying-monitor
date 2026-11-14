package com.aoying.aoying_monitor.pure

import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class NativeBoundaryTest {
    @Test fun firstGreetingAndCatchupWatermarksMayDifferWithoutSwallowingFutureSignal() {
        val reducer = ReplayReducer(null)
        assertEquals(500L, reducer.hello(500L))
        val delivery = reducer.replay(listOf(StreamEvent(501L, "signal.open")), 501L)
        assertEquals(501L, delivery.single().event.id)
        assertTrue(delivery.single().audible)
        assertTrue(reducer.complete(501L).isEmpty())
    }
    @Test fun emptyCatchupCanCompleteAtNewerWatermark() {
        val reducer = ReplayReducer(null)
        reducer.hello(500L)
        reducer.complete(501L)
        assertEquals(501L, reducer.cursor)
    }
    @Test(expected = IllegalStateException::class) fun watermarkMustNotChangeBetweenReplayPages() {
        val reducer = ReplayReducer(1L)
        reducer.hello(5L)
        reducer.replay(listOf(StreamEvent(2L, "x")), 6L)
        reducer.replay(listOf(StreamEvent(3L, "x")), 7L)
    }
    @Test(expected = IllegalStateException::class) fun ledgerRollbackRequiresExplicitResync() {
        ReplayReducer(500L).hello(1L)
    }

    private class Store(var value: Session? = null, var fail: Boolean = false) : SessionStore {
        override fun load() = value
        override fun save(session: Session) { if (fail) throw IllegalStateException("disk full"); value = session }
        override fun clear() { value = null }
    }
    private fun session() = Session("https://example.test", "a", "r", mapOf("id" to 1), mapOf("id" to 2))
    private open class Transport : AuthTransport {
        override fun login(origin: String, username: String, password: String, device: Map<String, Any?>) = Session(origin, username, "r", mapOf("id" to 1), device)
        override fun refresh(origin: String, refresh: String) = Session(origin, "rotated", "new-r", mapOf("id" to 1), mapOf("id" to 2))
        override fun revoke(session: Session) {}
    }
    @Test fun failedDurableRotationFailsClosedRatherThanKeepingConsumedRefresh() {
        val store = Store(session())
        val repository = AuthRepository(store, Transport())
        repository.restore("https://example.test")
        store.fail = true
        runCatching { repository.refresh("rotated") }
        assertNull(repository.current())
        assertNull(store.value)
    }
    @Test fun loginHandlerInvalidatesEpochBeforeWorkerStarts() {
        val repository = AuthRepository(Store(session()), Transport())
        repository.restore("https://example.test")
        val old = repository.generation()
        val pendingEpoch = repository.beginLogin()
        assertTrue(pendingEpoch > old)
        assertNull(repository.current())
        repository.logout()
        runCatching { repository.completeLogin(pendingEpoch, "https://example.test", "late", "", emptyMap()) }
        assertNull(repository.current())
    }
    @Test fun successfulHandlerLoginCommitsOnlyItsGeneration() {
        val repository = AuthRepository(Store(), Transport())
        val pendingEpoch = repository.beginLogin()
        assertEquals("fresh", repository.completeLogin(pendingEpoch, "https://example.test", "fresh", "", emptyMap())?.access)
    }
    @Test fun queuedLegacyRestoreCannotResurrectAfterLogout() {
        val repository = AuthRepository(Store(), Transport())
        val generation = repository.generation()
        repository.logout()
        runCatching { repository.restore("https://example.test", "legacy", generation) }
        assertNull(repository.current())
    }

    @Test fun logoutStopsNativeTransportServiceAndClearsAccountWithoutSettingUserStop() {
        val preferences = object : MonitorPreferences { override var userStopped = false }
        val effects = mutableListOf<String>()
        val lifecycle = MonitorLifecycle(preferences, { effects += "socket" }, { effects += "service" }, { effects += "cursors_and_notifications" })
        lifecycle.logout()
        assertEquals(listOf("socket", "service", "cursors_and_notifications"), effects)
        assertFalse(preferences.userStopped)
        assertTrue(lifecycle.enable(false))
        lifecycle.userStop()
        assertTrue(preferences.userStopped)
        lifecycle.logout()
        assertFalse(lifecycle.enable(false))
        assertTrue(lifecycle.enable(true))
        assertFalse(preferences.userStopped)
    }

    @Test fun explicitStopSurvivesAutomaticResumeButExplicitEnableCanRestart() {
        val policy = MonitorPolicy()
        assertEquals("user_stopped", policy.startReason(false, true, true, true, true, true, true, true))
        assertEquals("", policy.startReason(true, true, true, true, true, true, true, true))
    }
    @Test fun deniedPermissionAndChannelsNeverReportEnabled() {
        val policy = MonitorPolicy()
        assertEquals("notification_permission_denied", policy.startReason(true, false, true, true, false, true, true, true))
        assertEquals("notifications_disabled", policy.startReason(true, false, true, true, true, false, true, true))
        assertEquals("signal_channel_disabled", policy.startReason(true, false, true, true, true, true, true, false))
        assertEquals("status_channel_disabled", policy.startReason(true, false, true, true, true, true, false, true))
        assertEquals("no_session", policy.startReason(false, false, true, false, true, true, true, true))
        assertEquals("not_visible", policy.startReason(true, false, false, true, true, true, true, true))
    }
    @Test fun onlyResumedUnlockedInteractiveUiSuppressesSystemSignal() {
        val policy = MonitorPolicy()
        assertTrue(policy.uiVisible(true, true, true, false))
        assertFalse(policy.uiVisible(true, true, true, true))
        assertFalse(policy.uiVisible(true, true, false, false))
        assertFalse(policy.uiVisible(true, false, true, false))
        assertFalse(policy.uiVisible(false, true, true, false))
    }
    @Test fun heartbeatUsesJson25SecondPingAnd75SecondPongDeadline() {
        val heartbeat = Heartbeat(0L)
        assertFalse(heartbeat.ping(24999L))
        assertTrue(heartbeat.ping(25000L))
        assertFalse(heartbeat.ping(25001L))
        assertFalse(heartbeat.expired(74999L))
        assertTrue(heartbeat.expired(75000L))
        heartbeat.pong(75000L)
        assertFalse(heartbeat.expired(75001L))
    }
    @Test fun reconnectJitterIsBoundedAndCapped() {
        val policy = MonitorPolicy()
        assertEquals(1000L, policy.reconnectDelay(0, 0.0))
        assertTrue(policy.reconnectDelay(3, 0.0) in 6400L..9600L)
        assertTrue(policy.reconnectDelay(3, 1.0) in 6400L..9600L)
        assertTrue(policy.reconnectDelay(99, 1.0) in 1000L..30000L)
        assertNotEquals(policy.reconnectDelay(3, 0.0), policy.reconnectDelay(3, 1.0))
    }
    @Test fun tlsAndSameOriginAreMandatoryAndTicketsNeverRedirect() {
        assertEquals("https://example.test", SecureOrigin.normalize("https://example.test/"))
        assertTrue(runCatching { SecureOrigin.normalize("http://example.test") }.isFailure)
        assertTrue(runCatching { SecureOrigin.normalize("https://user:pass@example.test") }.isFailure)
        assertTrue(runCatching { SecureOrigin.validateSocket("https://example.test", "wss://other.test/ws?ticket=x") }.isFailure)
        assertTrue(runCatching { SecureOrigin.validateSocket("https://example.test", "ws://example.test/ws?ticket=x") }.isFailure)
        assertTrue(runCatching { SecureOrigin.validateSocket("https://example.test", "wss://example.test:8443/ws?ticket=x") }.isFailure)
        assertEquals("wss://example.test/ws?ticket=x", SecureOrigin.validateSocket("https://example.test", "wss://example.test/ws?ticket=x"))
    }
}
