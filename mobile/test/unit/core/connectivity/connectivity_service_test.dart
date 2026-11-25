import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/connectivity/connectivity_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ConnectivityService', () {
    test('can be instantiated', () {
      final service = ConnectivityService();
      expect(service, isA<ConnectivityService>());
      service.dispose();
    });

    test('connectivityStream is a Stream', () {
      final service = ConnectivityService();
      expect(service.connectivityStream, isA<Stream<List<ConnectivityResult>>>());
      service.dispose();
    });

    test('dispose can be called multiple times', () {
      final service = ConnectivityService();
      service.dispose();
      service.dispose(); // Should not throw
      expect(true, isTrue);
    });

    test('currentStatus returns a ConnectivityStatus', () {
      final service = ConnectivityService();
      expect(service.currentStatus, isA<ConnectivityStatus>());
      service.dispose();
    });

    test('isConnected returns a Future<bool>', () {
      final service = ConnectivityService();
      final result = service.isConnected();
      expect(result, isA<Future<bool>>());
      service.dispose();
    });

    test('waitForConnection returns a Future<bool>', () {
      final service = ConnectivityService();
      final result = service.waitForConnection(
        timeout: const Duration(seconds: 1),
        checkInterval: const Duration(milliseconds: 100),
      );
      expect(result, isA<Future<bool>>());
      service.dispose();
    });
  });
}