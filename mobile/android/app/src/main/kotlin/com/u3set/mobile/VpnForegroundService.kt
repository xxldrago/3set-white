package com.u3set.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder

/**
 * Started foreground service that keeps the Android VPN tunnel visible and
 * gives the user a single reliable way to tear it down.
 *
 * The notification is ongoing (not swipe-dismissible) and carries exactly one
 * action, «Отключить». Tapping it routes through [VpnMethodChannel] to Dart,
 * where the connection FSM moves to `disconnecting` and calls `bridge.stop()`
 * before it may reach `idle`. No traffic is ever allowed outside the tunnel
 * while this service is running (D-09).
 */
class VpnForegroundService : Service() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ThreeSetVpnService.ACTION_DISCONNECT) {
            // Forward the notification action to the Dart FSM, then retire the
            // foreground notification. The tunnel itself is torn down by the
            // FSM's awaited stop() so no orphan session survives.
            VpnMethodChannel.emitDisconnect()
            stopSelf()
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, buildNotification(this))
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        /** Notification channel id used by the ongoing VPN notification. */
        const val CHANNEL_ID = "3set-vpn"

        private const val NOTIFICATION_ID = 3001
        private const val CHANNEL_NAME = "VPN"
        private const val DISCONNECT_REQUEST_CODE = 3002

        /**
         * Builds the ongoing notification with the locked title and the
         * «Отключить» action. Kept static so the VPN service can reuse the
         * exact same notification when it promotes itself to the foreground.
         */
        fun buildNotification(context: Context): Notification {
            val disconnectIntent = Intent(context, VpnForegroundService::class.java)
                .setAction(ThreeSetVpnService.ACTION_DISCONNECT)
            val pendingIntentFlags =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                } else {
                    PendingIntent.FLAG_UPDATE_CURRENT
                }
            val disconnectAction = PendingIntent.getService(
                context,
                DISCONNECT_REQUEST_CODE,
                disconnectIntent,
                pendingIntentFlags,
            )
            val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder(context, CHANNEL_ID)
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(context)
            }
            return builder
                .setContentTitle("VPN активен · 3set")
                .setSmallIcon(android.R.drawable.stat_sys_vpn_ic)
                .setOngoing(true)
                .setAutoCancel(false)
                .setCategory(Notification.CATEGORY_SERVICE)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .addAction(
                    android.R.drawable.ic_menu_close_clear_cancel,
                    "Отключить",
                    disconnectAction,
                )
                .build()
        }

        /** Creates the low-importance channel once; idempotent on API 26+. */
        fun createNotificationChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                return
            }
            val manager = context.getSystemService(NotificationManager::class.java)
            val existing = manager.getNotificationChannel(CHANNEL_ID)
            if (existing != null) {
                return
            }
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW,
            )
            channel.description = "Активное VPN-соединение"
            manager.createNotificationChannel(channel)
        }
    }
}
