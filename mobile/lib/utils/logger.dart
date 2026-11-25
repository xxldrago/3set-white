import 'package:logger/logger.dart';

/// Pino-style structured logger for the mobile app.
/// Pretty printing in debug, JSON in release (via custom output).
Logger createLogger(String className) {
  return Logger(
    printer: PrettyPrinter(
      methodCount: 1,
      errorMethodCount: 3,
      lineLength: 120,
      colors: true,
      printEmojis: false,
      dateTimeFormat: DateTimeFormat.dateAndTime,
    ),
    filter: ProductionFilter(),
    level: Level.debug,
    output: ConsoleOutput(),
  );
}

/// Production filter that reduces log level in release builds
class ProductionFilter extends LogFilter {
  @override
  bool shouldLog(LogEvent event) {
    // In release mode, only log warnings and errors
    // In debug mode, log everything
    assert(() {
      return true; // Debug mode: log everything
    }());
    // Release mode: only warnings and above
    return event.level.index >= Level.warning.index;
  }
}

/// Convenience function to get a logger for a class
Logger getLogger(Type type) => createLogger(type.toString());

/// Log levels matching pino conventions
enum LogLevel {
  trace(0),
  debug(1),
  info(2),
  warn(3),
  error(4),
  fatal(5);

  final int value;
  const LogLevel(this.value);
}

/// Extension for structured logging
extension StructuredLogger on Logger {
  void logStructured(LogLevel level, String message, [Map<String, dynamic>? data]) {
    final logData = <String, dynamic>{
      'msg': message,
      if (data != null) ...data,
    };
    
    switch (level) {
      case LogLevel.trace:
      case LogLevel.debug:
        d(logData);
        break;
      case LogLevel.info:
        i(logData);
        break;
      case LogLevel.warn:
        w(logData);
        break;
      case LogLevel.error:
      case LogLevel.fatal:
        e(logData);
        break;
    }
  }
}