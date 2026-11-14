package com.aoying.aoying_monitor.monitor

import com.aoying.aoying_monitor.pure.Session
import org.json.JSONArray
import org.json.JSONObject

internal fun JSONObject.asMap(): Map<String, Any?> = keys().asSequence().associateWith { key -> jsonValue(get(key)) }
private fun jsonValue(value: Any?): Any? = when (value) {
    JSONObject.NULL, null -> null
    is JSONObject -> value.asMap()
    is JSONArray -> (0 until value.length()).map { jsonValue(value.get(it)) }
    else -> value
}
internal fun sessionFromJson(origin: String, data: JSONObject): Session = Session(
    origin = origin,
    access = data.getString("access_token"),
    refresh = data.getString("refresh_token"),
    user = data.getJSONObject("user").asMap(),
    device = data.getJSONObject("device").asMap(),
    expiresIn = data.getInt("expires_in"),
    expiresAt = data.optLong("expires_at_ms", System.currentTimeMillis() + data.getInt("expires_in") * 1000L),
)
internal fun Session.asJson(): JSONObject = JSONObject().put("origin", origin).put("access_token", access)
    .put("refresh_token", refresh).put("user", JSONObject(user)).put("device", JSONObject(device))
    .put("expires_in", expiresIn).put("expires_at_ms", expiresAt)
internal fun Session.bridgeMap(): Map<String, Any?> = mapOf(
    "access_token" to access, "refresh_token" to "", "token_type" to "bearer", "expires_in" to expiresIn,
    "user" to user, "device" to device,
)
