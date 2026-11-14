package com.aoying.aoying_monitor.pure

import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class NativeContractTest {
    private fun event(id: Long, kind: String = "signal.open") = StreamEvent(id, kind)

    @Test fun firstHelloIsSilentAndFirstFutureEventIsNotSwallowed() {
        val reducer = ReplayReducer(null)
        assertEquals(500L, reducer.hello(500L))
        assertTrue(reducer.complete(500L).isEmpty())
        val deliveries = reducer.live(event(501L))
        assertEquals(listOf(501L), deliveries.map { it.event.id })
        assertTrue(deliveries.single().audible)
    }

    @Test fun pagesOver201EventsBufferLiveUntilWatermarkAndDeduplicate() {
        val reducer = ReplayReducer(10L)
        reducer.hello(211L)
        assertTrue(reducer.live(event(215L)).isEmpty())
        val delivered = mutableListOf<Delivery>()
        delivered += reducer.replay((11L..110L).map { event(it) }, 211L)
        delivered += reducer.replay((111L..210L).map { event(it) }, 211L)
        delivered += reducer.replay(listOf(event(211L)), 211L)
        assertEquals(211L, reducer.cursor)
        delivered += reducer.complete(211L)
        assertEquals((11L..211L).toList() + 215L, delivered.map { it.event.id })
        assertEquals(1, delivered.count { it.audible })
        assertTrue(reducer.live(event(215L)).isEmpty())
        val reconnect = ReplayReducer(reducer.cursor)
        reconnect.hello(215L)
        reconnect.complete(215L)
        assertTrue(reconnect.live(event(215L)).isEmpty())
    }

    @Test fun gapsAndUnknownKindsAdvanceCursorWithoutTradeNotification() {
        val reducer = ReplayReducer(5L)
        reducer.hello(20L)
        reducer.replay(listOf(event(9L, "telegram.message")), 20L)
        reducer.complete(20L)
        assertEquals(20L, reducer.cursor)
        assertTrue(SignalNotificationPolicy().accepts("signal.open"))
        assertFalse(SignalNotificationPolicy().accepts("telegram.message"))
    }

    @Test fun fiveSignalKindsOnlyAndTestMarkerRemainsVisible() {
        val policy = SignalNotificationPolicy()
        listOf("open", "add", "reduce", "close", "leverage").forEach { assertTrue(policy.accepts("signal.$it")) }
        assertFalse(policy.accepts("device.registered"))
        assertEquals("[测试] 标题", policy.headline("标题", true))
    }

    @Test(expected = IllegalStateException::class) fun liveBufferOverflowForcesResyncWithoutAdvancingCursor() {
        val reducer = ReplayReducer(10L)
        reducer.hello(20L)
        repeat(1025) { reducer.live(event(30L + it)) }
    }

    @Test fun lateOldLoginCannotOverwriteNewLogin() {
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val store = MemoryStore()
        val repository = AuthRepository(store, object : Transport() {
            override fun login(origin: String, username: String, password: String, device: Map<String, Any?>): Session {
                if (username == "old") { entered.countDown(); assertTrue(release.await(3, TimeUnit.SECONDS)) }
                return session(username, "$username-r")
            }
        })
        val pool = Executors.newSingleThreadExecutor()
        try {
            val old = pool.submit<Session?> { repository.login("https://example.test", "old", "", emptyMap()) }
            assertTrue(entered.await(2, TimeUnit.SECONDS))
            repository.login("https://example.test", "new", "", emptyMap())
            release.countDown()
            runCatching { old.get(3, TimeUnit.SECONDS) }
            assertEquals("new", repository.current()?.access)
            assertEquals("new", store.value?.access)
        } finally { release.countDown(); pool.shutdownNow() }
    }

    private class MemoryStore(var value: Session? = null) : SessionStore {
        override fun load() = value
        override fun save(session: Session) { value = session }
        override fun clear() { value = null }
    }
    private fun session(access: String = "a", refresh: String = "r") = Session("https://example.test", access, refresh, mapOf("id" to 1), mapOf("id" to 2))
    private open class Transport : AuthTransport {
        override fun login(origin: String, username: String, password: String, device: Map<String, Any?>) = Session(origin, "new", "new-r", mapOf("id" to 2), device)
        override fun refresh(origin: String, refresh: String) = Session(origin, "rotated", "rotated-r", mapOf("id" to 1), mapOf("id" to 2))
        override fun revoke(session: Session) {}
    }

    @Test fun concurrent401RequestsRotateOnceAndReuseNewAccess() {
        val calls = AtomicInteger()
        val store = MemoryStore(session())
        val repository = AuthRepository(store, object : Transport() {
            override fun refresh(origin: String, refresh: String): Session { val n = calls.incrementAndGet(); return session("a$n", "r$n") }
        })
        val restored = repository.restore("https://example.test")
        assertNotNull("restore must establish the native owner", restored)
        val before = calls.get()
        val access = restored!!.access
        val pool = Executors.newFixedThreadPool(2)
        try {
            val first = pool.submit<Session?> { repository.refresh(access) }
            val second = pool.submit<Session?> { repository.refresh(access) }
            assertNotNull(first.get(3, TimeUnit.SECONDS))
            assertNotNull(second.get(3, TimeUnit.SECONDS))
            assertEquals(1, calls.get() - before)
        } finally { pool.shutdownNow() }
    }

    @Test fun logoutInvalidatesRefreshBeforeNetworkReturns() {
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val store = MemoryStore(session())
        val repository = AuthRepository(store, object : Transport() {
            override fun refresh(origin: String, refresh: String): Session {
                entered.countDown()
                assertTrue(release.await(3, TimeUnit.SECONDS))
                return super.refresh(origin, refresh)
            }
        })
        val pool = Executors.newSingleThreadExecutor()
        try {
            val pending = pool.submit<Session?> { repository.restore("https://example.test") }
            assertTrue("refresh must reach injected transport", entered.await(2, TimeUnit.SECONDS))
            repository.logout()
            release.countDown()
            runCatching { pending.get(3, TimeUnit.SECONDS) }
            assertNull(repository.current())
            assertNull(store.value)
        } finally { release.countDown(); pool.shutdownNow() }
    }
}
