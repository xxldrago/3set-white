import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:logger/logger.dart';
import 'package:mobile/core/api/dio_client.dart';
import 'package:mobile/core/storage/token_store.dart';
import 'package:mocktail/mocktail.dart';

class MockTokenStore extends Mock implements TokenStore {}

void main() {
  test("debug LogInterceptor never dumps request or response bodies", () {
    final client = DioClient(
      tokenStore: MockTokenStore(),
      logger: Logger(level: Level.nothing),
    );

    final interceptor = client.dio.interceptors.whereType<LogInterceptor>().single;

    expect(interceptor.requestBody, isFalse);
    expect(interceptor.responseBody, isFalse);
    expect(interceptor.requestHeader, isFalse);
    expect(interceptor.responseHeader, isFalse);
  });
}
