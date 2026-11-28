// Days/30 subscription ring (D-13). Pure Flutter CustomPainter: no flutter_svg,
// no confetti package, no load bar and no fabricated metric. Progress and color
// are derived only from the server's remainingDays.
import "dart:math" as math;

import "package:flutter/material.dart";

import "../../../app/theme.dart";

/// Draws the prototype ring (r=56, dash 351.86) with threshold colors.
class DaysRingPainter extends CustomPainter {
  /// Creates a painter for [days]; negative values clamp to an empty ring.
  const DaysRingPainter({required this.days, this.strokeWidth = 7});

  /// Server-derived remaining days.
  final int days;

  /// Ring thickness in logical pixels.
  final double strokeWidth;

  /// Prototype circumference: 2 * pi * 56.
  static const double circumference = 351.86;

  /// Clamps days/30 into 0..1 exactly like the prototype's dash offset.
  static double progressFor(int days) => (days / 30).clamp(0.0, 1.0);

  /// Prototype parity: green headroom, amber warning, red when nearly out.
  static Color colorForDays(int days) {
    if (days >= 8) return AppTheme.lime;
    if (days >= 3) return AppTheme.amber;
    return AppTheme.red;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final progress = progressFor(days);
    final radius = (size.shortestSide - strokeWidth) / 2;
    if (radius <= 0) return;
    final center = Offset(size.width / 2, size.height / 2);

    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..color = AppTheme.surface3,
    );

    if (progress <= 0) return;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -math.pi / 2,
      progress * 2 * math.pi,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round
        ..color = colorForDays(days),
    );
  }

  @override
  bool shouldRepaint(covariant DaysRingPainter oldDelegate) =>
      oldDelegate.days != days || oldDelegate.strokeWidth != strokeWidth;
}

/// The ring plus its centered days label, used by the Shop key card.
class DaysRing extends StatelessWidget {
  /// Creates the ring.
  const DaysRing({required this.days, this.size = 64, super.key});

  /// Remaining days from the server, or null when there is no key.
  final int? days;

  /// Outer diameter in logical pixels.
  final double size;

  @override
  Widget build(BuildContext context) {
    final value = days ?? 0;
    return Semantics(
      label: days == null ? "Нет ключа" : "$days дней осталось",
      child: SizedBox(
        width: size,
        height: size,
        // Accessibility (22.12): the drawn arc is decorative and contributes
        // no semantics node. The day count stays announced by the label above,
        // so excluding the painter never hides real state from a screen reader.
        child: Stack(
          alignment: Alignment.center,
          children: <Widget>[
            ExcludeSemantics(
              child: CustomPaint(
                painter: DaysRingPainter(days: value),
                size: Size.square(size),
              ),
            ),
            Text(
              days == null ? "—" : "$days",
              style: Theme.of(context).textTheme.displaySmall?.copyWith(
                    color: days == null
                        ? AppTheme.dim
                        : DaysRingPainter.colorForDays(value),
                  ),
            ),
          ],
        ),
      ),
    );
  }
}
