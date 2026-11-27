import "dart:io";

import "package:flutter_test/flutter_test.dart";

// Kept as concatenated constants so this file never contains a literal
// build/sign or simulation token that its own negative assertions would match.
const _rndToken = "Math" ".random";
const _fbToken = "flutter" " build ios";
const _xbToken = "xcode" "build";
const _csToken = "code" "sign";
const _ncToken = "--no-" "code" "sign";

/// Source-level assertions for the compile-only iOS NetworkExtension slice
/// (D-07). No tunnel is built, signed, launched or faked here.
void main() {
  final root = Directory.current.path;

  String read(String relative) {
    final file = File("$root/$relative");
    expect(file.existsSync(), isTrue,
        reason: "iOS preparation assertion failed: missing source file");
    return file.readAsStringSync();
  }

  void contains(String text, String needle, String label) {
    expect(text.contains(needle), isTrue,
        reason: "iOS preparation assertion failed: $label");
  }

  void excludes(String text, String needle, String label) {
    expect(text.contains(needle), isFalse,
        reason: "iOS preparation assertion failed: $label");
  }

  late final String provider;
  late final String plist;
  late final String entitlements;
  late final String pbxproj;
  late final String self;

  setUpAll(() {
    provider = read("ios/PacketTunnel/PacketTunnelProvider.swift");
    plist = read("ios/PacketTunnel/Info.plist");
    entitlements = read("ios/Runner/Runner.entitlements");
    pbxproj = read("ios/Runner.xcodeproj/project.pbxproj");
    self = read("test/unit/core/vpn/ios_prepared_test.dart");
  });

  test("Swift provider implements the documented NE contract", () {
    for (final token in const [
      "NEPacketTunnelProvider",
      "startTunnel",
      "stopTunnel",
      "setTunnelNetworkSettings",
      "NEOnDemandRuleConnect",
      "NEPacketTunnelFlow",
    ]) {
      contains(provider, token, "provider is missing NE contract token");
    }
  });

  test("IPv6 is captured and the always-on installer has a caller (WR-04)", () {
    for (final token in const [
      "NEIPv6Settings",
      "NEIPv6Route",
      "ipv6Settings",
      "excludedRoutes = []",
      "installAlwaysOnRules()",
    ]) {
      contains(provider, token, "IPv6/always-on wiring is missing");
    }
    // Definition plus real call — not just an orphan declaration.
    expect(
      provider.split("installAlwaysOnRules()").length - 1,
      greaterThanOrEqualTo(2),
      reason: "installAlwaysOnRules() is defined but never called",
    );
  });

  test("extension plist declares the packet-tunnel point and class", () {
    contains(plist, "com.apple.networkextension.packet-tunnel",
        "missing packet-tunnel extension point");
    contains(plist, "NSExtensionPrincipalClass",
        "missing extension principal class");
  });

  test("entitlement is retained and target is embedded in the app", () {
    contains(entitlements, "packet-tunnel-provider",
        "packet-tunnel-provider entitlement not retained");
    contains(pbxproj, "PacketTunnel", "PacketTunnel target not embedded");
    contains(pbxproj, "Embed App Extensions",
        "app extension is not embedded in Runner");
  });

  test("fd KVC risk is recorded as assumed, not solved", () {
    contains(provider, "[ASSUMED]", "fd KVC risk marker missing");
    contains(provider, "NOT implemented", "fd handoff not marked unresolved");
  });

  test("no fabricated connected state, IP, randomness or sleep", () {
    for (final token in const [
      _rndToken,
      "fakeIp",
      "fake_ip",
      "isConnected",
      "connected = true",
      "connected=true",
      "sleep(",
    ]) {
      excludes(provider, token, "simulation token in Swift provider");
    }
  });

  test("no tunnel build or signing command in source or test", () {
    for (final token in const [
      _fbToken,
      _xbToken,
      _csToken,
      _ncToken,
    ]) {
      excludes(provider, token, "build/sign command in Swift provider");
      excludes(plist, token, "build/sign command in extension plist");
      excludes(entitlements, token, "build/sign command in entitlements");
      excludes(pbxproj, token, "build/sign command in project file");
      excludes(self, token, "build/sign command in readiness test");
    }
  });
}
