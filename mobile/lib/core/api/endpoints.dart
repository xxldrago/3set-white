/// API endpoint paths for the mobile client.
/// All paths are relative to the base URL (https://dash.3set.online).
class Endpoints {
  // Auth endpoints
  static const String authLogin = '/api/mobile/auth/login';
  static const String authRegister = '/api/mobile/auth/register';
  static const String authRefresh = '/api/mobile/auth/refresh';
  static const String telegramNonce = '/api/mobile/auth/telegram/nonce';
  static const String telegramPoll = '/api/mobile/auth/telegram/poll';

  // Subscription endpoint
  static const String subscription = '/api/mobile/subscription';

  // Future endpoints (Phase 19+)
  static const String servers = '/api/mobile/servers';

  /// Backend-built full TUN config (D-01): client sends only `serverId` and
  /// never assembles a config or talks to ARTEMIDA directly.
  static const String config = '/api/mobile/config';
  static const String keys = '/api/mobile/keys';
  static const String payments = '/api/mobile/payments';
  static const String devices = '/api/mobile/devices';

  // Payment flow (Phase 21, D-04/D-05/D-06): create returns our non-secret
  // order id plus the server-returned hosted payment URL; status is a DB-only
  // ownership-scoped poll. No amount is ever sent by the client.
  static const String paymentCreate = '/api/mobile/payments/create';
  static const String paymentStatusPrefix = '/api/mobile/payments/status/';
  static String paymentStatus(String orderId) =>
      '$paymentStatusPrefix${Uri.encodeComponent(orderId)}';
}
