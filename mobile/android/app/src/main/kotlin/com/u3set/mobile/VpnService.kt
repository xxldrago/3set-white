package com.u3set.mobile

import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Owns the OS TUN interface for the connection FSM.
 *
 * The Android `VpnService.prepare()` consent check, `Builder.establish()` fd
 * and `onRevoke()` callback all live here. The `ParcelFileDescriptor` stays
 * Kotlin-owned: libbox dups the fd internally, so this class closes the
 * original on stop, cancel or revocation and no tunnel is ever left orphaned.
 *
 * Kill switch is permanently on (D-09): the builder routes all IPv4/IPv6
 * traffic through the tunnel, never calls the bypass-permitting builder
 * method, never clears the underlying networks and exposes no user toggle.
 */
class ThreeSetVpnService : VpnService() {

    private var tunnel: ParcelFileDescriptor? = null

    override fun onCreate() {
        super.onCreate()
        active = this
        VpnForegroundService.createNotificationChannel(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_CONNECT -> connectTunnel()
            ACTION_DISCONNECT -> {
                closeTunnel()
                stopForegroundCompat()
                stopSelf()
            }
        }
        // Never START_STICKY: an automatic restart would recreate the VPN
        // interface after the FSM has already gone back to idle.
        return START_NOT_STICKY
    }

    /**
     * Builds and establishes the OS TUN interface, then hands the raw fd to
     * Dart as an opaque integer. The fd is never logged or serialized into
     * persistent state; Dart passes it straight to the libbox TUN entry point.
     */
    private fun connectTunnel() {
        if (tunnel != null) {
            VpnMethodChannel.deliverStartFailure("already_connected")
            return
        }
        val builder = Builder()
            // Values mirror the libbox TunOptions of the backend-built config
            // (20-RESEARCH §1). Keeping them here avoids a route/address split.
            .addAddress(TUN_ADDRESS_V4, TUN_PREFIX_V4)
            .addAddress(TUN_ADDRESS_V6, TUN_PREFIX_V6)
            .addRoute(ALL_IPV4_ROUTE, ALL_IPV4_PREFIX)
            .addRoute(ALL_IPV6_ROUTE, ALL_IPV6_PREFIX)
            .addDnsServer(TUN_DNS_V4)
            .addDnsServer(TUN_DNS_V6)
            .setMtu(TUN_MTU)
            .setSession(SESSION_NAME)
        // D-09: intentionally no bypass call, no underlying-network override
        // and no per-app exclusion — all traffic is captured by the tunnel.

        val established = builder.establish()
        if (established == null) {
            VpnMethodChannel.deliverStartFailure("permission_denied")
            stopSelf()
            return
        }
        tunnel = established
        VpnMethodChannel.deliverStartedFd(established.fd)

        // The ongoing notification lives in its own started foreground
        // service so the disconnect action reaches Dart through the channel.
        startForegroundService(Intent(this, VpnForegroundService::class.java))
    }

    /**
     * Protects one outbound socket fd from being captured by our own tunnel.
     * Exposed on the method channel for the native socket handoff; the fd is
     * an opaque integer and is never logged.
     */
    fun protectSocket(fd: Int): Boolean = protect(fd)

    override fun onRevoke() {
        super.onRevoke()
        // D-11: close the descriptor and stop before Dart may reach idle, and
        // notify the FSM so it can drive error -> disconnecting -> idle.
        closeTunnel()
        stopForegroundCompat()
        VpnMethodChannel.emitRevoked()
        stopSelf()
    }

    override fun onDestroy() {
        closeTunnel()
        if (active === this) {
            active = null
        }
        super.onDestroy()
    }

    private fun closeTunnel() {
        tunnel?.close()
        tunnel = null
    }

    private fun stopForegroundCompat() {
        @Suppress("DEPRECATION")
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopService(Intent(this, VpnForegroundService::class.java))
    }

    companion object {
        /** Action used by the notification's «Отключить» button. */
        const val ACTION_DISCONNECT = "com.u3set.mobile.vpn.DISCONNECT"

        private const val ACTION_CONNECT = "com.u3set.mobile.vpn.CONNECT"
        private const val TUN_ADDRESS_V4 = "172.18.0.1"
        private const val TUN_ADDRESS_V6 = "fdfe:dcba:9876::1"
        private const val TUN_PREFIX_V4 = 30
        private const val TUN_PREFIX_V6 = 126
        private const val TUN_DNS_V4 = "172.18.0.2"
        private const val TUN_DNS_V6 = "fdfe:dcba:9876::2"
        private const val TUN_MTU = 1500
        private const val ALL_IPV4_ROUTE = "0.0.0.0"
        private const val ALL_IPV6_ROUTE = "::"
        private const val ALL_IPV4_PREFIX = 0
        private const val ALL_IPV6_PREFIX = 0
        private const val SESSION_NAME = "3set VPN"

        @Volatile
        private var active: ThreeSetVpnService? = null

        /** Requests teardown through the service lifecycle, never in-place. */
        fun requestStop(context: Context) {
            context.startService(
                Intent(context, ThreeSetVpnService::class.java)
                    .setAction(ACTION_DISCONNECT),
            )
        }

        /** Protects a native outbound socket through the live tunnel service. */
        fun protectFd(fd: Int): Boolean = active?.protectSocket(fd) == true
    }
}

/**
 * The single Flutter ↔ Kotlin bridge on `com.u3set.mobile/vpn`.
 *
 * Dart calls `prepare`, `start`, `protect` and `stop`; Kotlin emits
 * `onRevoked` and `onDisconnect` events back to the FSM. Only stable result
 * codes cross the channel: no fd, config, token or raw platform text is ever
 * placed in an error message or log.
 */
object VpnMethodChannel {

    private const val CHANNEL_NAME = "com.u3set.mobile/vpn"
    private const val ERROR_PERMISSION = "permission_denied"
    private const val ERROR_NO_CONTEXT = "unavailable"

    private var channel: MethodChannel? = null
    private var appContext: Context? = null
    private var pendingStart: MethodChannel.Result? = null

    /** Attaches the bridge to the Flutter engine's binary messenger. */
    fun register(messenger: BinaryMessenger, context: Context) {
        appContext = context.applicationContext
        channel = MethodChannel(messenger, CHANNEL_NAME).also { methodChannel ->
            methodChannel.setMethodCallHandler { call, result -> handle(call, result) }
        }
    }

    /** Detaches the bridge; pending starts fail with a stable code. */
    fun unregister() {
        deliverStartFailure(ERROR_NO_CONTEXT)
        channel?.setMethodCallHandler(null)
        channel = null
        appContext = null
    }

    private fun handle(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "prepare" -> prepare(result)
            "start" -> start(result)
            "stop" -> stop(result)
            "protect" -> protect(call, result)
            else -> result.notImplemented()
        }
    }

    private fun prepare(result: MethodChannel.Result) {
        val context = appContext
        if (context == null) {
            result.error(ERROR_NO_CONTEXT, null, null)
            return
        }
        // A non-null consent intent means the OS has not granted the tunnel
        // yet. Dart maps that to the locked «Нужно разрешение VPN» + retry idle
        // path (D-10); the intent itself never crosses the channel.
        result.success(VpnService.prepare(context) == null)
    }

    private fun start(result: MethodChannel.Result) {
        val context = appContext
        if (context == null) {
            result.error(ERROR_NO_CONTEXT, null, null)
            return
        }
        if (VpnService.prepare(context) != null) {
            result.error(ERROR_PERMISSION, null, null)
            return
        }
        if (pendingStart != null) {
            result.error("already_connecting", null, null)
            return
        }
        pendingStart = result
        context.startService(
            Intent(context, ThreeSetVpnService::class.java)
                .setAction(ThreeSetVpnService.ACTION_CONNECT),
        )
    }

    private fun stop(result: MethodChannel.Result) {
        pendingStart = null
        val context = appContext
        if (context != null) {
            ThreeSetVpnService.requestStop(context)
            context.stopService(Intent(context, VpnForegroundService::class.java))
        }
        result.success(null)
    }

    private fun protect(call: MethodCall, result: MethodChannel.Result) {
        val fd = call.argument<Int>("fd")
        if (fd == null) {
            result.error("invalid_fd", null, null)
            return
        }
        result.success(ThreeSetVpnService.protectFd(fd))
    }

    /** Delivers the OS-owned fd to Dart as an opaque integer. */
    fun deliverStartedFd(fd: Int) {
        pendingStart?.success(mapOf("fd" to fd))
        pendingStart = null
    }

    /** Fails a pending start with a stable code; no detail text is exposed. */
    fun deliverStartFailure(code: String) {
        pendingStart?.error(code, null, null)
        pendingStart = null
    }

    /** Notifies Dart that the OS revoked the VPN consent (D-11). */
    fun emitRevoked() {
        channel?.invokeMethod("onRevoked", null)
    }

    /** Notifies Dart that the notification's disconnect action was tapped. */
    fun emitDisconnect() {
        channel?.invokeMethod("onDisconnect", null)
    }

}
