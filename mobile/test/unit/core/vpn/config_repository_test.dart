import "dart:typed_data";

import "package:dio/dio.dart";
import "package:flutter_test/flutter_test.dart";
import "package:mobile/core/vpn/config_repository.dart";

/// Stub transport: no network, no Flutter engine, no secrets logged.
class StubAdapter implements HttpClientAdapter {
  StubAdapter(this._answer);

  final Future<ResponseBody> Function(RequestOptions options) _answer;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) =>
      _answer(options);

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(String body, {int statusCode = 200}) =>
    ResponseBody.fromString(
      body,
      statusCode,
      headers: <String, List<String>>{
        Headers.contentTypeHeader: <String>[Headers.jsonContentType],
      },
    );

ConfigRepository repositoryFor(
  Future<ResponseBody> Function(RequestOptions) answer,
) =>
    ConfigRepository(
      Dio(BaseOptions(baseUrl: "http://localhost"))
        ..httpClientAdapter = StubAdapter(answer),
    );

void main() {
  test("opaque config returned verbatim; only serverId is sent", () async {
    String? query;
    const secretBody =
        '{"ok":true,"config":{"inbounds":[{"type":"tun"}],'
        '"secret":"SUPERSECRET-CONFIG-FRAGMENT"}}';
    final repository = repositoryFor((options) async {
      query = options.queryParameters["serverId"] as String?;
      return _json(secretBody);
    });

    final config = await repository.fetch("srv-42");

    expect(query, "srv-42");
    expect(config["secret"], "SUPERSECRET-CONFIG-FRAGMENT");
    expect(config.containsKey("inbounds"), isTrue);
  });

  test("401 maps to auth_failed, 403 and body no_active_key to no_active_key",
      () async {
    final unauthorized = repositoryFor(
      (options) async => _json("{}", statusCode: 401),
    );
    final forbidden = repositoryFor(
      (options) async => _json("{}", statusCode: 403),
    );
    final gated = repositoryFor(
      (options) async => _json('{"ok":false,"error":"no_active_key"}'),
    );

    for (final pair in <Map<String, Object>>[
      <String, Object>{"repo": unauthorized, "code": "auth_failed"},
      <String, Object>{"repo": forbidden, "code": "no_active_key"},
      <String, Object>{"repo": gated, "code": "no_active_key"},
    ]) {
      try {
        await (pair["repo"] as ConfigRepository).fetch("srv-42");
        fail("expected ConfigRepositoryException");
      } on ConfigRepositoryException catch (error) {
        expect(error.code, pair["code"]);
        expect(error.toString(), isNot(contains("SUPERSECRET")));
      }
    }
  });

  test("unknown server and transport failures fail closed without raw text",
      () async {
    final notFound = repositoryFor(
      (options) async => _json('{"ok":false,"error":"server_not_found"}'),
    );
    final offline = repositoryFor((options) async => throw DioException(
          requestOptions: options,
          error: "_socket closed SUPERSECRET-CONFIG-FRAGMENT",
        ));

    for (final pair in <Map<String, Object>>[
      <String, Object>{"repo": notFound, "code": "config_invalid"},
      <String, Object>{"repo": offline, "code": "unreachable"},
    ]) {
      try {
        await (pair["repo"] as ConfigRepository).fetch("srv-42");
        fail("expected ConfigRepositoryException");
      } on ConfigRepositoryException catch (error) {
        expect(error.code, pair["code"]);
        expect(error.toString(), isNot(contains("SUPERSECRET")));
        expect(error.toString(), isNot(contains("_socket")));
      }
    }
  });
}
