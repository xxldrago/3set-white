// REQ-SET-03 / T-22-16: referral and subscription-link copy rows.
//
// Both rows use the existing injectable clipboard seam (`linkCopierProvider`)
// and the frozen Russian toast from the Shop screen. The referral code comes
// from the caller's own subscription identity and ALREADY carries the public
// `3SET-` prefix, so it is appended once and never duplicated. No link is
// invented, logged or sent anywhere except the clipboard.
import "dart:async";

import "package:flutter/material.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";

import "../../../app/constants.dart" show apiBaseUrl;
import "../../../app/theme.dart";
import "../../shop/shop_screen.dart" show linkCopierProvider;

/// Builds the public referral URL from the STORED code exactly once.
///
/// Empty when the server identity has no code — the caller then renders no
/// row instead of fabricating one.
String referralUrl(String? referralCode) {
  final code = referralCode?.trim();
  if (code == null || code.isEmpty) return "";
  return "$apiBaseUrl/?ref=$code";
}

/// Copies through the existing seam and shows the existing frozen toast.
Future<void> copyLinkWithToast(
  BuildContext context,
  WidgetRef ref,
  String link,
) async {
  await ref.read(linkCopierProvider)(link);
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(content: Text("Ссылка скопирована")),
  );
}

/// Referral-code handoff plus the real subscription-link copy row.
class ReferralRow extends ConsumerWidget {
  /// Creates the two honest copy rows.
  const ReferralRow({
    required this.referralCode,
    required this.subscriptionLink,
    super.key,
  });

  /// Stored code from the caller's own identity block (already prefixed).
  final String? referralCode;

  /// Real subscription link from `/api/mobile/subscription`.
  final String? subscriptionLink;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = referralUrl(referralCode);
    final link = subscriptionLink?.trim();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        if (url.isNotEmpty)
          _CopyAction(
            icon: Icons.group_add_outlined,
            label: "Ссылка для друзей",
            onTap: () => unawaited(copyLinkWithToast(context, ref, url)),
          ),
        if (link != null && link.isNotEmpty)
          _CopyAction(
            icon: Icons.link,
            label: "Копировать ссылку на подписку",
            onTap: () => unawaited(copyLinkWithToast(context, ref, link)),
          ),
      ],
    );
  }
}

class _CopyAction extends StatelessWidget {
  const _CopyAction({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: <Widget>[
            Icon(icon, color: AppTheme.lime, size: 18),
            const SizedBox(width: 12),
            Expanded(child: Text(label, style: theme.textTheme.bodyMedium)),
            const Icon(Icons.copy_outlined, color: AppTheme.muted, size: 16),
          ],
        ),
      ),
    );
  }
}
