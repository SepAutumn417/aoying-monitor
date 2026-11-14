package com.aoying.aoying_monitor.monitor

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.aoying.aoying_monitor.MainActivity
import com.aoying.aoying_monitor.pure.SignalNotificationPolicy
import com.aoying.aoying_monitor.pure.StreamEvent

class MonitorNotifications(private val context: Context) {
    companion object {
        const val STATUS = "aoying.monitor.status.v1"
        const val SIGNAL = "aoying.monitor.signals.v1"
        const val ONGOING_ID = 7001
    }
    private val manager = context.getSystemService(NotificationManager::class.java)
    private val policy = SignalNotificationPolicy()
    fun createChannels() {
        if (Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(NotificationChannel(STATUS, "后台监控状态", NotificationManager.IMPORTANCE_LOW).apply {
                description = "用户开启的持续信号连接状态；受网络、电池与系统后台限制"
                setSound(null, null); enableVibration(false); setShowBadge(false)
            })
            manager.createNotificationChannel(NotificationChannel(SIGNAL, "交易信号提醒", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "后台或锁屏时的真实信号；测试信号会明确标注测试"
                enableVibration(true)
            })
        }
    }
    fun permission(): Boolean = Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    fun globalEnabled(): Boolean = manager.areNotificationsEnabled()
    fun channelEnabled(id: String): Boolean = Build.VERSION.SDK_INT < 26 || (manager.getNotificationChannel(id)?.importance ?: NotificationManager.IMPORTANCE_NONE) != NotificationManager.IMPORTANCE_NONE
    private fun builder(channel: String): Notification.Builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, channel) else Notification.Builder(context)
    private fun contentIntent(): PendingIntent = PendingIntent.getActivity(context, 10,
        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun ongoing(connection: String): Notification {
        val stop = PendingIntent.getService(context, 11, Intent(context, BackgroundMonitorService::class.java).setAction(BackgroundMonitorService.ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val text = when (connection) {
            "live" -> "连接正常；后台送达受网络、电池和系统限制"
            "reconnecting" -> "连接断开，正在重连；暂不能接收新提醒"
            else -> "正在连接信号服务；送达受系统后台限制"
        }
        return builder(STATUS).setSmallIcon(android.R.drawable.stat_notify_sync).setContentTitle("傲影 · 信号监控")
            .setContentText(text).setContentIntent(contentIntent()).setOngoing(true).setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE).setVisibility(Notification.VISIBILITY_PRIVATE)
            .setSound(null).setDefaults(0).addAction(Notification.Action.Builder(null, "停止监控", stop).build()).build()
    }
    fun updateOngoing(connection: String) { manager.notify(ONGOING_ID, ongoing(connection)) }
    fun signal(scope: String, event: StreamEvent) {
        val headline = event.payload["headline"] as? String ?: "交易信号"
        val title = policy.headline(headline, event.payload["test"] == true)
        val summary = event.payload["summary"] as? String ?: "请打开应用查看信号详情"
        val notification = builder(SIGNAL).setSmallIcon(android.R.drawable.stat_notify_more).setContentTitle(title)
            .setContentText(summary).setStyle(Notification.BigTextStyle().bigText(summary)).setContentIntent(contentIntent())
            .setAutoCancel(true).setOnlyAlertOnce(true).setDefaults(Notification.DEFAULT_ALL).setCategory(Notification.CATEGORY_EVENT)
            .setVisibility(Notification.VISIBILITY_PRIVATE).build()
        // Stable identity survives reconnect/process recreation; updates cannot ring an existing notification again.
        manager.notify("signal:$scope:${event.id}", 0, notification)
    }
    fun clearAccountNotifications() {
        manager.activeNotifications.filter { it.tag?.startsWith("signal:") == true }.forEach { manager.cancel(it.tag, it.id) }
    }
}
