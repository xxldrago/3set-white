// PacketTunnelProvider.swift — Phase 20 compile-only NetworkExtension source (D-07).
// Prepared from official NEPacketTunnelProvider docs; NOT built, signed, run or
// verified until Apple approves the packet-tunnel-provider entitlement.
// No config, token, raw NSError, private-API workaround or fake state is
// committed here (D-01/D-05/D-19/D-20).
import Foundation
import NetworkExtension

/// Generic failure codes only: raw NSError text can echo configuration
/// fragments, and configuration carries outbound secrets (D-19).
enum PacketTunnelSetupError: Error {
  case networkSettingsFailed
  case onDemandConfigurationFailed
}

/// Non-secret TUN values mirror the backend `/config` contract (D-01). The host
/// app may pass them in `options`; nothing here reads, renders or logs secrets.
private struct TunnelValues {
  let mtu: Int
  let dnsServers: [String]
  let address: String
  let subnetMask: String
  let includedRoutes: [(destination: String, mask: String)]
  let addressV6: String
  let prefixV6: Int
  let includedRoutesV6: [(destination: String, prefix: Int)]

  static let fallback = TunnelValues(
    mtu: 1500,
    dnsServers: ["172.18.0.2", "fdfe:dcba:9876::2"],
    address: "172.18.0.1",
    subnetMask: "255.255.255.252",
    includedRoutes: [(destination: "0.0.0.0", mask: "0.0.0.0")],
    // Mirrors the IPv6 TUN address/route carried by the backend config (D-08).
    addressV6: "fdfe:dcba:9876::1",
    prefixV6: 126,
    includedRoutesV6: [(destination: "::", prefix: 0)]
  )

  static func from(_ options: [String: Any]?) -> TunnelValues {
    guard let options = options else { return fallback }
    let mtu = (options["mtu"] as? NSNumber)?.intValue ?? fallback.mtu
    let dns = (options["dnsServers"] as? [String]).flatMap {
      $0.isEmpty ? nil : $0
    } ?? fallback.dnsServers
    let address = options["tunnelAddress"] as? String ?? fallback.address
    let mask = options["tunnelSubnetMask"] as? String ?? fallback.subnetMask
    let addressV6 = options["tunnelAddressV6"] as? String ?? fallback.addressV6
    let prefixV6 =
      (options["tunnelPrefixV6"] as? NSNumber)?.intValue ?? fallback.prefixV6
    return TunnelValues(
      mtu: mtu,
      dnsServers: dns,
      address: address,
      subnetMask: mask,
      includedRoutes: fallback.includedRoutes,
      addressV6: addressV6,
      prefixV6: prefixV6,
      includedRoutesV6: fallback.includedRoutesV6
    )
  }
}

@objc(PacketTunnelProvider)
final class PacketTunnelProvider: NEPacketTunnelProvider {

  override func startTunnel(
    options: [String: Any]?,
    completionHandler: @escaping (Error?) -> Void
  ) {
    let values = TunnelValues.from(options)
    let settings = NEPacketTunnelNetworkSettings(
      tunnelRemoteAddress: "127.0.0.1"
    )
    settings.mtu = NSNumber(value: values.mtu)

    let dns = NEDNSSettings(servers: values.dnsServers)
    dns.matchDomains = [""]
    settings.dnsSettings = dns

    let ipv4 = NEIPv4Settings(
      addresses: [values.address],
      subnetMasks: [values.subnetMask]
    )
    ipv4.includedRoutes = values.includedRoutes.map {
      NEIPv4Route(destinationAddress: $0.destination, subnetMask: $0.mask)
    }
    // Kill switch (D-09): no excluded routes — all IP traffic enters the tunnel.
    ipv4.excludedRoutes = []
    settings.ipv4Settings = ipv4

    // WR-04: IPv6 must be captured too. The backend TUN config carries both
    // families; omitting this silently leaked IPv6 outside the always-on kill
    // switch. No excluded routes for IPv6 either.
    let ipv6 = NEIPv6Settings(
      addresses: [values.addressV6],
      networkPrefixLengths: [NSNumber(value: values.prefixV6)]
    )
    ipv6.includedRoutes = values.includedRoutesV6.map {
      NEIPv6Route(
        destinationAddress: $0.destination,
        networkPrefixLength: NSNumber(value: $0.prefix)
      )
    }
    ipv6.excludedRoutes = []
    settings.ipv6Settings = ipv6

    // D-09/D-07: the always-on installer is wired from the prepared source but
    // is compile-only — no entitlement request, build, signing or device
    // verification happens in phase 20. Generic failure only (D-19).
    try? PacketTunnelOnDemand.installAlwaysOnRules()

    // [ASSUMED] fd handoff risk (recorded, not solved): upstream obtains the fd
    // through private KVC on packetFlow ("socket.fileDescriptor"). There is no
    // public fd accessor and Apple warns against assuming one. Deliberately
    // NOT implemented here — no private API, no fake fd, no fake state. Revisit
    // only after the entitlement is approved.
    _ = documentedPacketFlowSeam()

    setTunnelNetworkSettings(settings) { error in
      // Never forward or log the raw NSError (D-19/D-20).
      completionHandler(
        error == nil ? nil : PacketTunnelSetupError.networkSettingsFailed
      )
    }
  }

  override func stopTunnel(
    with reason: NEProviderStopReason,
    completionHandler: @escaping () -> Void
  ) {
    // The fd stays native-owned; the host closes it before this returns.
    completionHandler()
  }

  /// Public documented seam. No packet-buffer bridge or read loop in phase 20.
  private func documentedPacketFlowSeam() -> NEPacketTunnelFlow { packetFlow }
}

/// Always-on kill switch (D-09). `NEOnDemandRuleConnect()` carries no interface
/// filter, so the rule matches ALL interfaces; there is no user toggle.
enum PacketTunnelOnDemand {
  static func installAlwaysOnRules() throws {
    let manager = NEVPNManager.shared()
    manager.onDemandRules = [NEOnDemandRuleConnect()]
    manager.isOnDemandEnabled = true
    do {
      try manager.saveToPreferences()
    } catch {
      // Generic code only; never propagate raw NSError text (D-19).
      throw PacketTunnelSetupError.onDemandConfigurationFailed
    }
  }
}
