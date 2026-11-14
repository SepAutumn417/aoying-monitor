package com.aoying.aoying_monitor.pure

import java.util.TreeMap

data class StreamEvent(val id: Long, val kind: String, val payload: Map<String, Any?> = emptyMap(), val createdAt: String = "")
data class Delivery(val event: StreamEvent, val audible: Boolean)

/** Single connection reducer. Persist cursor after successful delivery; discard on reconnect. */
class ReplayReducer(initialCursor: Long?) {
    var cursor: Long = initialCursor ?: 0L
        private set
    private val first = initialCursor == null
    private var catchingUp = true
    private var greeting: Long? = null
    private var snapshot: Long? = null
    private val buffered = TreeMap<Long, StreamEvent>()

    fun hello(watermark: Long): Long {
        check(watermark >= 0 && greeting == null) { "Invalid hello" }
        check(cursor <= watermark) { "ledger_rewound" }
        greeting = watermark
        if (first) cursor = watermark
        return cursor
    }

    fun live(event: StreamEvent): List<Delivery> {
        if (event.id <= cursor) return emptyList()
        if (catchingUp) {
            check(buffered.containsKey(event.id) || buffered.size < 1024) { "Live buffer overflow: resync required" }
            buffered[event.id] = event
            return emptyList()
        }
        cursor = event.id
        return listOf(Delivery(event, true))
    }

    fun replay(events: List<StreamEvent>, watermark: Long): List<Delivery> {
        bindWatermark(watermark)
        check(events.zipWithNext().all { (a, b) -> a.id < b.id }) { "Replay not ordered" }
        check(events.all { it.id > 0 && it.id <= watermark }) { "Replay outside snapshot" }
        return events.filter { it.id > cursor }.map {
            cursor = it.id
            Delivery(it, first && it.id > (greeting ?: Long.MAX_VALUE))
        }
    }

    private fun bindWatermark(watermark: Long) {
        check(catchingUp && greeting != null && watermark >= greeting!!) { "Invalid catchup watermark" }
        if (snapshot == null) snapshot = watermark
        check(snapshot == watermark) { "Replay watermark mismatch" }
    }

    fun complete(watermark: Long): List<Delivery> {
        bindWatermark(watermark)
        cursor = maxOf(cursor, watermark)
        catchingUp = false
        val pending = buffered.values.toList()
        buffered.clear()
        return pending.flatMap { live(it) }
    }
}

class SignalNotificationPolicy {
    private val kinds = setOf("signal.open", "signal.add", "signal.reduce", "signal.close", "signal.leverage")
    fun accepts(kind: String): Boolean = kind in kinds
    fun headline(text: String, test: Boolean): String = if (test && !text.contains("测试")) "[测试] $text" else text
}
