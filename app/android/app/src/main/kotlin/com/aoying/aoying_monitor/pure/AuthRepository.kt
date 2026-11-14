package com.aoying.aoying_monitor.pure

data class Session(val origin: String, val access: String, val refresh: String, val user: Map<String, Any?>, val device: Map<String, Any?>, val expiresIn: Int = 900, val expiresAt: Long = System.currentTimeMillis() + expiresIn * 1000L)
interface SessionStore {
    fun load(): Session?
    fun save(session: Session)
    fun clear()
}
interface AuthTransport {
    fun login(origin: String, username: String, password: String, device: Map<String, Any?>): Session
    fun refresh(origin: String, refresh: String): Session
    fun revoke(session: Session)
}
class AuthFailure(val code: String) : RuntimeException(code)

/** One owner per application process. The network never holds the epoch lock. */
class AuthRepository(private val store: SessionStore, private val transport: AuthTransport) {
    private val lock = Any()
    private val rotation = Any()
    private var session: Session? = null
    private var epoch = 0L

    fun current(): Session? = synchronized(lock) { session }
    fun generation(): Long = synchronized(lock) { epoch }

    private fun commit(expected: Long, next: Session): Session = synchronized(lock) {
        if (expected != epoch) throw AuthFailure("session_changed")
        try {
            store.save(next) // Durable encrypted write must succeed before publishing/migrating.
        } catch (_: Exception) {
            epoch++
            session = null
            runCatching { store.clear() }
            throw AuthFailure("secure_storage_failed")
        }
        session = next
        next
    }

    fun login(origin: String, username: String, password: String, device: Map<String, Any?>): Session {
        return completeLogin(beginLogin(), origin, username, password, device)
    }

    fun beginLogin(): Long = synchronized(lock) {
        epoch++
        session = null
        store.clear()
        epoch
    }
    fun completeLogin(expected: Long, origin: String, username: String, password: String, device: Map<String, Any?>): Session {
        synchronized(lock) { if (expected != epoch) throw AuthFailure("session_changed") }
        return commit(expected, transport.login(origin, username, password, device))
    }

    fun restore(origin: String, legacyRefresh: String? = null, expectedGeneration: Long? = null): Session? = synchronized(rotation) {
        val state = synchronized(lock) {
            if (expectedGeneration != null && expectedGeneration != epoch) throw AuthFailure("session_changed")
            val saved = session ?: store.load()
            if (saved != null && saved.origin != origin) throw AuthFailure("origin_changed")
            Triple(epoch, saved, session != null)
        }
        if (state.third) return@synchronized state.second
        val token = state.second?.refresh ?: legacyRefresh?.takeIf { it.isNotBlank() } ?: return@synchronized null
        try {
            commit(state.first, transport.refresh(origin, token))
        } catch (error: AuthFailure) {
            if (error.code == "unauthenticated") clearIfEpoch(state.first)
            throw error
        }
    }

    fun refresh(expectedAccess: String): Session? = synchronized(rotation) {
        val state = synchronized(lock) { Pair(epoch, session) }
        val old = state.second ?: throw AuthFailure("unauthenticated")
        if (old.access != expectedAccess) return@synchronized old
        try {
            commit(state.first, transport.refresh(old.origin, old.refresh))
        } catch (error: AuthFailure) {
            if (error.code == "unauthenticated") clearIfEpoch(state.first)
            throw error
        }
    }

    private fun clearIfEpoch(expected: Long) = synchronized(lock) {
        if (epoch == expected) {
            epoch++
            session = null
            store.clear()
        }
    }

    /** Caller stops monitoring before invoking this, then revokes returned snapshot asynchronously. */
    fun logout(): Session? = synchronized(lock) {
        epoch++
        val old = session
        session = null
        store.clear()
        old
    }
}
