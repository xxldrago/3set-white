import "package:freezed_annotation/freezed_annotation.dart";

part "device.freezed.dart";
part "device.g.dart";

/// One device row from `GET /api/mobile/devices` (REQ-DEV-01, T-22-06).
///
/// The provider only supplies an opaque [token] and a nullable [name]; [label]
/// is the optional local friendly name joined by the BFF. There is deliberately
/// no `lastSeen`, no `keyId` and no subscription link on this model — the
/// provider contract cannot supply a truthful value for any of them.
@freezed
abstract class Device with _$Device {
  /// Creates a device row.
  const factory Device({
    required String token,
    String? label,
    String? name,
  }) = _Device;

  /// Parses one backend device row.
  factory Device.fromJson(Map<String, dynamic> json) => _$DeviceFromJson(json);
}

/// Envelope of `GET /api/mobile/devices`. [deviceLimit] is the server-quoted
/// integer capacity and is display-only; the client never grows it locally.
@freezed
abstract class DevicesPayload with _$DevicesPayload {
  /// Creates the device-list envelope.
  const factory DevicesPayload({
    required bool ok,
    String? error,
    @JsonKey(name: "deviceLimit") int? deviceLimit,
    List<Device>? devices,
  }) = _DevicesPayload;

  /// Parses the backend envelope.
  factory DevicesPayload.fromJson(Map<String, dynamic> json) =>
      _$DevicesPayloadFromJson(json);
}

/// Honest display fallback: local label, then provider name, then a neutral
/// placeholder. No relative time and no invented device identity.
String deviceDisplayName(Device device) {
  final label = device.label;
  if (label != null && label.isNotEmpty) return label;
  final name = device.name;
  if (name != null && name.isNotEmpty) return name;
  return "Устройство";
}
