package com.u3set.mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Rule 2 (missing critical wiring): without this registration the
        // `com.u3set.mobile/vpn` channel has no Kotlin handler, so prepare /
        // start / stop and the notification's disconnect action never reach
        // the connection FSM. Kept to one line; no plugin or new dependency.
        VpnMethodChannel.register(
            flutterEngine.dartExecutor.binaryMessenger,
            applicationContext,
        )
    }
}
