/// API base URL for mobile client
const String apiBaseUrl = 'https://dash.3set.online';

/// Storage keys for secure storage
class StorageKeys {
  static const String accessToken = 'access_token';
  static const String refreshToken = 'refresh_token';
  static const String userId = 'user_id';
}

/// API endpoints
class Endpoints {
  static const String authLogin = '/api/mobile/auth/login';
  static const String authRegister = '/api/mobile/auth/register';
  static const String authRefresh = '/api/mobile/auth/refresh';
  static const String telegramNonce = '/api/mobile/auth/telegram/nonce';
  static const String telegramPoll = '/api/mobile/auth/telegram/poll';
  static const String subscription = '/api/mobile/subscription';
  static const String servers = '/api/mobile/servers';
  static const String keys = '/api/mobile/keys';
  static const String payments = '/api/mobile/payments';
  static const String devices = '/api/mobile/devices';
}

/// JWT configuration
class JwtConfig {
  static const int accessTokenTtlMinutes = 15;
  static const int refreshTokenTtlDays = 30;
  static const int refreshThresholdMinutes = 5;
}

/// Telegram deep link configuration
class TelegramConfig {
  static const String botUsername = 'set3vpn_bot';
  static const String deepLinkScheme = 'https';
  static const String deepLinkHost = 't.me';
  static const String customScheme = 'three-set-vpn';
  static const int pollIntervalSeconds = 3;
  static const int maxPollAttempts = 60; // 3 minutes
  static const int nonceTtlSeconds = 600; // 10 minutes
}

/// Biometric configuration
class BiometricConfig {
  static const String promptTitle = '3set VPN';
  static const String promptSubtitle = 'Authenticate to access your VPN';
  static const bool enforceBiometrics = false; // Allow device passcode fallback
}

/// Connectivity configuration
class ConnectivityConfig {
  static const Duration debounceDuration = Duration(milliseconds: 500);
}

/// App-wide constants
class AppConstants {
  static const String appName = '3set VPN';
  static const String supportEmail = 'support@3set.online';
}