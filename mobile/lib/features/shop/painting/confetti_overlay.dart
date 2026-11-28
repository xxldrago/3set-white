// Own confetti overlay (D-14). CustomPainter + AnimationController, no new
// dependency, no timer-driven success and no demo flag. It starts ONLY when an
// observed payment status rises into CONFIRMED/provisioned, then reveals the
// real key details and a Russian toast built from the server's expiresAt.
import "dart:math" as math;

import "package:flutter/material.dart";

import "../../../app/theme.dart";

/// Deterministic falling particles. No Random: repaints must be stable.
class ConfettiPainter extends CustomPainter {
  /// Creates a painter at animation progress 0..1.
  const ConfettiPainter({required this.progress});

  /// Animation progress, clamped in [paint].
  final double progress;

  /// Prototype-confetti palette from the dark theme.
  static const List<Color> palette = <Color>[
    AppTheme.lime,
    AppTheme.lime2,
    AppTheme.lime3,
    AppTheme.teal,
    AppTheme.text,
    AppTheme.amber,
  ];

  /// Number of deterministic particles.
  static const int particleCount = 30;

  @override
  void paint(Canvas canvas, Size size) {
    final p = progress.clamp(0.0, 1.0);
    final gravity = p * p;
    for (var i = 0; i < particleCount; i++) {
      final seed = ((i * 73) % 101) / 101;
      final horizontal = (seed + i * 0.037) % 1.0;
      final x = size.width * (0.06 + 0.88 * horizontal);
      final speed = 0.7 + 0.3 * (((i * 17) % 13) / 13);
      final y = size.height * (-0.12 + 1.24 * gravity * speed);
      if (y > size.height + 20) continue;

      final angle = i * 1.7 + p * (3 + (i % 5));
      canvas.save();
      canvas.translate(x, y);
      canvas.rotate(angle % (2 * math.pi));
      canvas.drawRect(
        Rect.fromCenter(
          center: Offset.zero,
          width: 5 + (i % 3).toDouble(),
          height: 9 + (i % 2).toDouble() * 3,
        ),
        Paint()
          ..color = palette[i % palette.length]
              .withValues(alpha: 1 - (p * 0.55).clamp(0.0, 1.0)),
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant ConfettiPainter oldDelegate) =>
      oldDelegate.progress != progress;
}

/// Watches a real payment status and celebrates exactly once on the rising
/// edge into a success state. Wraps [child] so the overlay covers the shop.
///
/// [status] is the DB poll outcome mirrored by the screen's purchase status;
/// [expiresAt] and [link] come from the single subscription provider. No date
/// or key detail is fabricated when they are absent.
class ConfettiOnStatus extends StatefulWidget {
  /// Creates the status-driven celebration wrapper.
  const ConfettiOnStatus({
    required this.status,
    required this.child,
    this.expiresAt,
    this.link,
    this.onProvisioned,
    this.onCopyLink,
    super.key,
  });

  /// Current real payment status (for example `provisioned` or `CONFIRMED`).
  final String? status;

  /// Screen content below the overlay.
  final Widget child;

  /// Real `expiresAt` from /api/mobile/subscription.
  final String? expiresAt;

  /// Real subscription link from /api/mobile/subscription.
  final String? link;

  /// Called once on the rising edge so the screen can refresh subscription.
  final VoidCallback? onProvisioned;

  /// Copies the real server link via the Shop's clipboard seam (D-15).
  final VoidCallback? onCopyLink;

  /// True only for the DB-written terminal success statuses.
  static bool isProvisioned(String? status) {
    if (status == null) return false;
    return status == "provisioned" || status.toUpperCase() == "CONFIRMED";
  }

  @override
  State<ConfettiOnStatus> createState() => _ConfettiOnStatusState();
}

class _ConfettiOnStatusState extends State<ConfettiOnStatus>
    with TickerProviderStateMixin {
  late final AnimationController _controller;
  bool _wasProvisioned = false;
  bool _celebrating = false;
  bool _showDetails = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed && mounted && _celebrating) {
        setState(() {
          _celebrating = false;
          _showDetails = true;
        });
        _toast();
      }
    });
    // A screen opened already-provisioned must not replay old confetti.
    _wasProvisioned = ConfettiOnStatus.isProvisioned(widget.status);
  }

  @override
  void didUpdateWidget(covariant ConfettiOnStatus oldWidget) {
    super.didUpdateWidget(oldWidget);
    final nowProvisioned = ConfettiOnStatus.isProvisioned(widget.status);
    if (!_wasProvisioned && nowProvisioned && mounted) {
      setState(() {
        _celebrating = true;
        _showDetails = false;
      });
      _controller.forward(from: 0);
      widget.onProvisioned?.call();
    }
    _wasProvisioned = nowProvisioned;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String? get _formattedDate {
    final parsed = DateTime.tryParse(widget.expiresAt ?? "");
    if (parsed == null) return null;
    final day = parsed.day.toString().padLeft(2, "0");
    final month = parsed.month.toString().padLeft(2, "0");
    return "$day.$month.${parsed.year}";
  }

  void _toast() {
    if (!mounted) return;
    final date = _formattedDate;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          date == null
              ? "Подписка продлена"
              : "Подписка продлена до $date",
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: <Widget>[
        Positioned.fill(child: widget.child),
        if (_celebrating)
          Positioned.fill(
            // Accessibility (22.12): the particles are pure decoration. They
            // must never appear as a screen-reader node or a false affordance,
            // but the phase-21 animation and timing are unchanged.
            child: ExcludeSemantics(
              child: IgnorePointer(
                child: AnimatedBuilder(
                  animation: _controller,
                  builder: (context, _) => CustomPaint(
                    painter: ConfettiPainter(progress: _controller.value),
                    size: Size.infinite,
                  ),
                ),
              ),
            ),
          ),
        if (_showDetails) Positioned.fill(child: _details(context)),
      ],
    );
  }

  Widget _details(BuildContext context) {
    final theme = Theme.of(context);
    final date = _formattedDate;
    return Container(
      color: AppTheme.bg.withValues(alpha: 0.82),
      alignment: Alignment.center,
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  const Icon(Icons.check_circle, color: AppTheme.lime, size: 56),
                  const SizedBox(height: 12),
                  Text(
                    "Ключ активен",
                    style: theme.textTheme.headlineSmall?.copyWith(
                      color: AppTheme.text,
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (date != null)
                    Text(
                      "Действует до $date",
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppTheme.muted,
                      ),
                    ),
                  if (widget.link != null && widget.link!.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 16),
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: Text(
                            widget.link!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: theme.textTheme.labelMedium?.copyWith(
                              color: AppTheme.teal,
                            ),
                          ),
                        ),
                        if (widget.onCopyLink != null)
                          IconButton(
                            tooltip: "Скопировать ссылку",
                            icon: const Icon(Icons.copy, size: 18),
                            onPressed: widget.onCopyLink,
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: () {
                      if (mounted) setState(() => _showDetails = false);
                    },
                    child: const Text("Готово"),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
