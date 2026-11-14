package com.aoying.aoying_monitor.monitor

import com.aoying.aoying_monitor.pure.AuthFailure
import com.aoying.aoying_monitor.pure.AuthTransport
import com.aoying.aoying_monitor.pure.SecureOrigin
import com.aoying.aoying_monitor.pure.Session
import okhttp3.Call
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** No automatic retries/redirects of one-use refresh tokens or tickets. Never log request URLs. */
class NativeHttp : AuthTransport {
    val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
        .retryOnConnectionFailure(false).connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS).callTimeout(25, TimeUnit.SECONDS).build()
    private val json = "application/json; charset=utf-8".toMediaType()
    private fun request(origin: String, path: String, body: JSONObject, access: String? = null): Request {
        val builder = Request.Builder().url(SecureOrigin.normalize(origin) + path).post(body.toString().toRequestBody(json))
        if (access != null) builder.header("Authorization", "Bearer $access")
        return builder.build()
    }
    fun execute(call: Call): JSONObject = call.execute().use { response ->
        if (response.code == 401 || response.code == 403) throw AuthFailure("unauthenticated")
        if (!response.isSuccessful) throw AuthFailure("network_unavailable")
        val body = response.body ?: throw AuthFailure("invalid_response")
        if (body.contentLength() > 1_048_576) throw AuthFailure("invalid_response")
        JSONObject(body.string())
    }
    override fun login(origin: String, username: String, password: String, device: Map<String, Any?>): Session = sessionFromJson(origin,
        execute(client.newCall(request(origin, "/api/auth/login", JSONObject().put("username", username).put("password", password).put("device", JSONObject(device))))))
    override fun refresh(origin: String, refresh: String): Session = sessionFromJson(origin,
        execute(client.newCall(request(origin, "/api/auth/refresh", JSONObject().put("refresh_token", refresh)))))
    override fun revoke(session: Session) {
        execute(client.newCall(request(session.origin, "/api/auth/logout", JSONObject().put("refresh_token", session.refresh), session.access)))
    }
    fun ticketCall(session: Session): Call = client.newCall(request(session.origin, "/api/ws/ticket", JSONObject(), session.access))
}
