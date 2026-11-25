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
  static const String keys = '/api/mobile/keys';
  static const String payments = '/api/mobile/payments';
  static const String devices = '/api/mobile/devices';
}