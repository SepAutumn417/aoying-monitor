package com.aoying.aoying_monitor

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import com.aoying.aoying_monitor.monitor.MonitorRuntime
import com.aoying.aoying_monitor.monitor.bridgeMap
import com.aoying.aoying_monitor.pure.AuthFailure
import com.aoying.aoying_monitor.pure.SecureOrigin
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/** Only bridge and visible permission boundaries live here; Activity destruction never stops FGS. */
class MainActivity : FlutterActivity() {
    private val runtime by lazy { MonitorRuntime.get(applicationContext) }
    private val main = Handler(Looper.getMainLooper())
    private var permissionResult: MethodChannel.Result? = null
    private var permissionResolved = false
    private var permissionEpoch = -1L
    private val permissionCode = 7041

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.aoying.monitor/control").setMethodCallHandler { call, result ->
            try { handle(call, result) } catch (error: Exception) { fail(result, error) }
        }
        EventChannel(flutterEngine.dartExecutor.binaryMessenger, "com.aoying.monitor/events").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, events: EventChannel.EventSink) { runtime.attachEvents(this@MainActivity, events) }
            override fun onCancel(arguments: Any?) { runtime.detachEvents(this@MainActivity) }
        })
    }
    private fun args(call: MethodCall): Map<*, *> = call.arguments as? Map<*, *> ?: emptyMap<Any, Any>()
    private fun text(args: Map<*, *>, key: String): String = args[key] as? String ?: throw AuthFailure("invalid_arguments")
    private fun background(result: MethodChannel.Result, operation: () -> Any?) {
        runtime.worker.execute {
            try { val response = operation(); main.post { result.success(response); runtime.publishStatus() } }
            catch (error: Exception) { main.post { fail(result, error); runtime.publishStatus() } }
        }
    }
    private fun handle(call: MethodCall, result: MethodChannel.Result) {
        val args = args(call)
        when (call.method) {
            "auth.login" -> {
                val origin = SecureOrigin.normalize(text(args, "baseUrl"))
                val username = text(args, "username")
                val password = text(args, "password")
                val device = (args["device"] as? Map<*, *>)?.entries?.associate { (key, value) -> key.toString() to value } ?: emptyMap()
                val epoch = runtime.beginLogin() // Invalidates existing/queued auth now, not on worker scheduling.
                background(result) { runtime.auth.completeLogin(epoch, origin, username, password, device).bridgeMap() }
            }
            "auth.restore" -> {
                val origin = SecureOrigin.normalize(text(args, "baseUrl"))
                val legacy = args["legacyRefresh"] as? String
                val epoch = runtime.auth.generation()
                background(result) { runtime.auth.restore(origin, legacy, epoch)?.bridgeMap() }
            }
            "auth.refresh" -> {
                val expected = text(args, "expectedAccess")
                val epoch = runtime.auth.generation()
                background(result) {
                    if (runtime.auth.generation() != epoch) throw AuthFailure("session_changed")
                    runtime.auth.refresh(expected)?.bridgeMap()
                }
            }
            "auth.logout" -> {
                val old = runtime.logout() // Stop + epoch + clear are synchronous, even if HTTP is offline.
                result.success(null)
                if (old != null) runtime.worker.execute { runCatching { runtime.http.revoke(old) } }
            }
            "monitor.start" -> {
                val explicit = args["requestPermission"] == true
                if (explicit && !runtime.notifications.permission() && Build.VERSION.SDK_INT >= 33) {
                    if (!runtime.activityVisible()) { result.success(runtime.rejected("not_visible")); return }
                    if (runtime.auth.current() == null) { result.success(runtime.rejected("no_session")); return }
                    if (permissionResult != null) { result.success(runtime.rejected("permission_request_pending")); return }
                    permissionResult = result
                    permissionEpoch = runtime.auth.generation()
                    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), permissionCode)
                } else result.success(runtime.start(explicit))
            }
            "monitor.stop" -> result.success(runtime.userStop())
            "monitor.status" -> result.success(runtime.status())
            "monitor.visibility" -> { runtime.visibility(this, args["visible"] == true); result.success(runtime.status()) }
            "monitor.batterySettings" -> {
                if (!runtime.activityVisible()) { result.success(runtime.rejected("not_visible")); return }
                startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                result.success(runtime.status())
            }
            else -> result.notImplemented()
        }
    }
    private fun fail(result: MethodChannel.Result, error: Exception) {
        val code = (error as? AuthFailure)?.code ?: if (error is IllegalArgumentException) "invalid_arguments" else "native_operation_failed"
        // Never propagate Throwable.message: HTTP errors/URLs can contain session credentials or tickets.
        result.error(code, when (code) {
            "unauthenticated", "no_session" -> "登录已失效，请重新登录"
            "session_changed" -> "会话已变更，旧操作已忽略"
            "secure_storage_failed" -> "安全存储不可用，请重新登录"
            "invalid_arguments" -> "请求参数无效"
            else -> "原生操作未完成，请检查状态后重试"
        }, null)
    }
    override fun onResume() {
        super.onResume()
        runtime.activityResumed(this, true)
        if (permissionResolved) finishPermission()
        runtime.publishStatus()
    }
    override fun onPause() { runtime.activityResumed(this, false); super.onPause() }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == permissionCode && permissionResult != null) {
            permissionResolved = true
            if (runtime.activityVisible()) finishPermission()
            else if (!runtime.notifications.permission()) finishPermission()
        }
    }
    private fun finishPermission() {
        val result = permissionResult ?: return
        permissionResult = null; permissionResolved = false
        try {
            result.success(if (permissionEpoch == runtime.auth.generation()) runtime.start(true) else runtime.rejected("no_session"))
        } catch (error: Exception) { fail(result, error) }
    }
    override fun onDestroy() {
        runtime.activityResumed(this, false)
        runtime.detachEvents(this)
        permissionResult?.success(runtime.status())
        permissionResult = null
        // NO monitor.stop: the explicit service outlives this Flutter Activity/engine.
        super.onDestroy()
    }
}
