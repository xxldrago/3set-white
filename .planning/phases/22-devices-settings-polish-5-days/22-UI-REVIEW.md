# Phase 22 — UI Review

**Audited:** 2026-11-28
**Baseline:** Abstract 6-pillar standards + locked `22-CONTEXT.md` decisions D-01…D-09 + visual reference `.planning/seeds/prototype-mobile-client.html`. **No `22-UI-SPEC.md` exists** (phase planned with `--skip-ui`), so there is no approved token/spacing/copy contract to diff against; findings are measured against the locked decisions, the seed prototype, and internal consistency. D-01/D-02 (read-only always-on kill switch), D-05 (honest add), D-06 (deferred-delete undo), D-07 (read-only network chip), D-08/D-09 (local-only reminders, human-gated package) are treated as intentional divergences from the prototype's toggles, **not** as defects.
**Screenshots:** not captured. No browser/screenshot MCP or running dev server in this session — this is a **static code audit** of Dart/native sources, planning artifacts and the prototype HTML. Visual-runtime parity, on-device screen reading and notification delivery remain manual-only and are already recorded in `22-VALIDATION.md:59-70`. Screenshot storage is git-safe (`.planning/ui-reviews/.gitignore` verified present before any capture attempt).

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Frozen RU copy is faithful and honest, but the undo toast claims a delete that has not fired yet and the device-limit text lies when subscription data is absent. |
| 2. Visuals | 2/4 | Dark hierarchy and icon labelling are sound, but the assembled profile sheet drops half the prototype's content and the always-on paid CTA outranks the honest add action. |
| 3. Color | 3/4 | Verbatim prototype palette, zero hardcoded colors, and a numerically verified AA `dim` fix; destructive/danger styling is still missing and primary labels use the muted token. |
| 4. Typography | 3/4 | Three typefaces wired coherently, but 7 distinct text styles in the phase files and 10px `labelSmall` on user-facing chip copy. |
| 5. Spacing | 3/4 | Consistent 8/12/16 rhythm and tokenized radii, but three competing horizontal padding values and no declared scale. |
| 6. Experience Design | 2/4 | Deferred delete and confirm-gated reset are well built, but auto-connect and logout have no UI caller, the undo window is 1s shorter than the snackbar, and Android 13+ notifications are never requested. |

**Overall: 16/24**

---

## Top 3 Priority Fixes

1. **BLOCKER — auto-connect preference has no UI writer, so REQ-SET-02 is unreachable.** `AutoConnectStore.setAutoConnect()` exists only at `mobile/lib/core/settings/auto_connect_listener.dart:47-52` and is never called by any widget (repo-wide grep: only the listener/store/main.dart references). The preference therefore stays at its `false` default (`auto_connect_listener.dart:43`) for every user for the life of the app; the one-shot listener in `main.dart:48` can never fire a real connect. The prototype exposes this as the «Автоподключение» switch (`prototype-mobile-client.html:424`). Add a read-only-on-load `SwitchListTile`/`Switch` row to `ProfileSheet`'s «Настройки» section that seeds from `autoConnectStoreProvider.readAutoConnect()` and calls `setAutoConnect(value)`, with a frozen Russian `Semantics` label and a widget test proving one write per toggle.

2. **BLOCKER — local expiry reminders are never permission-gated on Android 13+.** `AndroidManifest.xml:9` declares `POST_NOTIFICATIONS`, but there is **no `requestPermissions()` call anywhere** in `mobile/lib` and no settings/copy surface explaining reminders (`local_notifications.dart:75-83` only initializes; `:143-155` swallows init failure). On API 33+ a manifest declaration alone does not grant notification permission, so the T-7/T-3/T-1 scheduler (`expiry_scheduler.dart:39-64`) can schedule into a channel the OS silently drops — the phase's headline REQ-NOTIF-01 deliverable fails with no in-app explanation. Fix: request `AndroidNotificationPermission` once at plugin init (or from an explicit reminders row in the profile) before `schedule()`, and add a visible «Уведомления о сроке подписки» status row that reflects granted/denied; keep copy Russian and navigation-only (`local_notifications.dart:32-37,119-122`).

3. **BLOCKER — there is no logout affordance anywhere in the mobile client.** `authNotifier.logout()` exists (`mobile/lib/core/auth/auth_notifier.dart:249`) but no widget calls it; the prototype's «Выйти из аккаунта» row (`prototype-mobile-client.html:431`) was dropped from `ProfileSheet`. A user who needs to switch accounts or end a session cannot do so from the app (Reset Demo clears tokens as a side effect but is not logout and is not labelled as such). Add a danger-styled «Выйти из аккаунта» row at the bottom of the profile sheet with confirm-then-call semantics: `authNotifier.logout()` then the existing `/auth` navigation seam, plus a widget test asserting one logout call and zero provider/device deletes.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

All user-facing strings are Russian; no `Submit`/`Click Here`/`OK`/`Cancel`/`Save` generic labels appear in the audited files. Locked copy is honoured exactly: D-02's «Kill switch: включён» + «Трафик вне VPN заблокирован» (`settings/kill_switch_row.dart:18-21`), frozen «Ссылка скопирована» (`settings/referral_row.dart:36`, `devices/devices_sheet.dart:98`), honest identity fallbacks «Устройство» (`devices/device.dart:49`) and «Пользователь» (`profile_sheet.dart:34`), fixed notification copy with no interpolated expiry/link/token (`notifications/local_notifications.dart:33-37`). Provider text is mapped through `subscriptionNotice` (`devices/devices_providers.dart:16-19`) so no raw transport wording reaches the UI.

- **WARNING — toast claims a completed action 5 seconds early.** `devices/devices_sheet.dart:76-89` shows «Устройство отключено» (past tense) immediately on tap, while `DeferredDeleteController` only fires the DELETE after its 5s window (`deferred_delete_controller.dart:19,42-66`). The same frame renders the row as «Отключается» at 0.6 opacity (`devices_sheet.dart:141-145,189-200`) — two contradictory states for one action. Fix: pending copy «Устройство отключается…» on tap and only show the completed past-tense notice after the timer's future completes; keep «Вернуть» on both.
- **WARNING — false device-limit claim on missing data.** `devices/devices_sheet.dart:129-132` defaults `deviceLimit` to `0` when the subscription is still loading, has no active key, or failed; `:153-160` then renders «Лимит устройств достигнут» as if capacity were exhausted. A user with no key sees a false capacity error rather than a key gate. Fix: gate the limit copy on `subscriptionAsync.hasValue && deviceLimit > 0` and render nothing (or the stable no-key notice) while unknown.
- **WARNING — header avatar identity is fabricated.** `main_header.dart:181-189` hardcodes the avatar letter «А» while `ProfileSheet`'s real identity renders the correct first letter (`profile_sheet.dart:153-164`). For any user not named «А…» the header and the sheet disagree about who is signed in — a small but visible identity copy defect. Fix: pass the resolved display name into `MainHeader` from `server_pool_screen.dart:115` and derive the initial from it.
- **INFO — no user-facing notification copy.** REQ-NOTIF-01 is implemented entirely in plugin/native code; the settings sheet never tells the user that expiry reminders exist or that they were denied. See Pillar 6 fix 2.

### Pillar 2: Visuals (2/4)

The forced dark theme, rounded bottom sheet (`theme.dart:386-395`), clear section headers, icon-only tooltips plus `Semantics` labels on all four pool-header actions (`main_header.dart:139-194`), and zero `NavigationBar` satisfy D-15/D-16. The kill switch is correctly a plain read-only card with a shield icon (`kill_switch_row.dart:26-49`), never a switch.

- **BLOCKER-class visual content gap — profile sheet drops most of the prototype's sections.** Prototype `#sheet-profile` contains an identity **card**, a subscription summary card (days left / expiry date / device count / link box), device list, kill-switch + auto-connect switches, referral card, reset and logout (`prototype-mobile-client.html:400-432`). `ProfileSheet` (`profile_sheet.dart:49-88`) renders a bare identity `Row`, a kill-switch card, devices, referral/network/reset rows — no subscription summary (days/expiry/link), no auto-connect switch, no logout, no explicit close button (prototype `:402`). `22-CONTEXT.md:31-34` grants discretion over *format*, not over missing functionality; two of the omissions are full BLOCKERs in Pillar 6. Fix: restore the subscription summary as a themed card and an explicit «Закрыть» icon button in the sheet header.
- **WARNING — primary CTA hierarchy is inverted.** `devices/devices_sheet.dart:147-166` always renders «Увеличить лимит» as a full-width `FilledButton` (lime `onPrimary` via `theme.dart:186-207`), even when `capacity.canAdd` is true and the honest «Добавить это устройство» button is present, and even when no key data has loaded. The prototype uses a small ghost «+ Добавить» in the section header and no always-on upsell (`prototype-mobile-client.html:419`). A user is visually pushed toward a paid action that cannot succeed without an active key. Fix: show the paid `FilledButton` only when `capacity.atLimit && subscriptionAsync.hasValue`, and demote the add action to the prototype's ghost chip.
- **WARNING — network chip icon contradicts its own label.** Both `profile_sheet.dart:124-128` and `pool_toolbar.dart:85-89` render `Icons.wifi` for every non-offline label, but `networkLabelProvider` can emit «LTE» or «Ethernet» (`server_pool_screen.dart:42-56`) — D-07 promises the *real* connection type. Fix: map `mobile → Icons.signal_cellular_alt`, `ethernet → Icons.settings_ethernet`, `wifi → Icons.wifi`.
- **WARNING — identity card treatment regressed.** `profile_sheet.dart:158-164` uses a flat `surface3` circle with a lime letter; the prototype uses the lime gradient square with a status dot (`prototype-mobile-client.html:110-111,404-405`). Apply `AppTheme.gradStart/gradEnd` and the 12px rounded square to restore the prototype's focal identity treatment.
- **INFO — no explicit sheet close affordance.** `_profileSheet` uses `showModalBottomSheet` without a close button (`server_pool_screen.dart:387-392`); dismissal relies on scrim tap/drag. Acceptable on mobile, but it diverges from the prototype and is unfriendly to users who do not discover drag-to-dismiss.

### Pillar 3: Color (3/4)

`theme.dart:10-102` reproduces the prototype palette verbatim and is forced app-wide (`main.dart:60-62`). **Zero hardcoded hex/rgb literals** were found across all audited Dart files; every color flows through `AppTheme`. The 22-05 contrast fix (`755c2df`) was verified numerically, not taken on trust: `dim = #829486` (`theme.dart:63`) computes to **5.42:1 on surface, 5.00:1 on surface2, 4.61:1 on surface3** (all ≥ WCAG AA 4.5:1), versus the old `#6f8272` at 4.24/3.92/3.61. SnackBar, dialog and bottom sheet are all themed dark (`theme.dart:370-409`), so the undo toast and reset confirm do not flash Material light surfaces.

Accent distribution is restrained: across the seven phase UI files there are 6 `lime`, 2 `lime2`, 2 gradient, 2 `teal`, 1 `amber` and 4 `red` (error-only) references, with dark surfaces dominating — a credible 60/30/10 split.

- **WARNING — destructive action lacks danger styling.** The reset row uses an amber icon (`settings/reset_row.dart:47`) and its confirm dialog's destructive button is a lime `FilledButton` (`settings/reset_row.dart:72-75`), visually identical to a primary purchase CTA. The prototype reserves `btn-danger` for destructive actions (`prototype-mobile-client.html:68,431`). Fix: style the confirm button with `AppTheme.red`/`colorScheme.error` and reserve lime for non-destructive commitments.
- **WARNING — primary row labels use the muted token.** `theme.dart:334-339` defines `bodyMedium` as `muted` (#a7b8a9), and the phase uses it for device names, copy actions, reset and network labels (`devices_sheet.dart:197,158`, `referral_row.dart:97`, `reset_row.dart:52`, `profile_sheet.dart:110`). The prototype renders these as `--text` (#f2f7ec) with `--dim` reserved for captions (`prototype-mobile-client.html:235`). The result is a flat, uniformly secondary hierarchy. Fix: use `bodyLarge`/explicit `AppTheme.text` for row titles and keep `bodySmall`+`dim` for captions.

### Pillar 4: Typography (3/4)

The three prototype typefaces are wired correctly — Manrope body, Unbounded display (`profile_sheet.dart:58,64,68`, `theme.dart:81-87`), JetBrains Mono for pills/codes (`theme.dart:352-363`) — and no ad-hoc `fontSize:` literals were introduced in the audited files; all sizing flows through `textTheme`. The icon-only accessibility labels are frozen Russian and carry no link/token/provider text (`main_header.dart:142-192`), satisfying the e3d6e20 fix.

- **WARNING — style breadth exceeds the abstract guideline.** The phase UI files use 7 distinct `textTheme` styles (`bodySmall`×7, `bodyMedium`×6, `titleMedium`×4, `labelSmall`×2, `labelMedium`×2, `headlineSmall`×2, `titleLarge`×1); the theme defines 10 sizes from 10–32px (`theme.dart:273-364`). With no UI-SPEC there is no authorization for this breadth — it is coherent Material 3, not arbitrary, but should be codified before more screens inherit it.
- **WARNING — 10px user-facing copy in chips.** `labelSmall` is 10px (`theme.dart:358-363`) and is used for the network chip text in both the profile and pool toolbar (`profile_sheet.dart:132-134`, `pool_toolbar.dart:91-94`). Even after the AA contrast fix, 10px on a mobile device is below a comfortable minimum for a status the user must read.
- **WARNING — section headers do not outrank their content.** «Устройства» and «Настройки» use `titleMedium` (14px/w700) while every row beneath them uses `bodyMedium` (14px/w400) (`profile_sheet.dart:64-75`); the prototype's `.label` is 11.5px **uppercase with 0.1em tracking** (`prototype-mobile-client.html:79`), which reads as a deliberate label rather than a same-size title. Add uppercase/tracking or promote the headers.

### Pillar 5: Spacing (3/4)

The sheet uses `EdgeInsets.fromLTRB(20, 16, 20, 24)` (`profile_sheet.dart:53`) with an 8/12/16 `SizedBox` rhythm throughout, card radius is tokenized (`theme.dart:77-78`), pill radius 999 and sheet radius 26 match the prototype (`profile_sheet.dart:118`, `theme.dart:390-394`). No arbitrary `[Npx]` values exist in the Dart files. The 22-03 overflow deviation was correctly fixed with `SingleChildScrollView` (`profile_sheet.dart:52`), so all rows stay reachable on short screens.

- **WARNING — three competing horizontal page insets.** Main header and toolbar use 18px (`main_header.dart:50`, `pool_toolbar.dart:46`), the profile sheet uses 20px (`profile_sheet.dart:53`), and the prototype uses 18px for both (`prototype-mobile-client.html:152,171`). The 2px drift makes the sheet's rows visibly misalign with the header when the sheet is dragged up. Fix: standardize on 18px or declare a spacing token.
- **WARNING — undocumented gap set.** The phase files use 9 distinct `SizedBox` increments (2, 4, 5, 6, 8, 10, 12, 14, 16), with one-off 5px and 14px gaps (`profile_sheet.dart:129`, `main_header.dart:161`) and no declared scale to validate against. Codify 4/8/12/16/20 and fold the outliers into it.
- **INFO — kill-switch card radius is 12** (`settings/kill_switch_row.dart:30`) versus the prototype's card radius 18 (`prototype-mobile-client.html:75,19`); minor fidelity drift, not a usability issue.

### Pillar 6: Experience Design (2/4)

Genuinely good coverage exists: the five-second deferred delete is a real cancellable timer with generation guard and disposal cleanup (`deferred_delete_controller.dart:42-84`) — undo cancels before any provider call, no row is ever reinserted; the paid capacity CTA posts intent only with no client `keyId` (`devices_sheet.dart:101-112`); the network chip is a pure observer with no tap (`profile_sheet.dart:97-143`); Reset Demo confirms before a local-only call (`settings/reset_row.dart:61-83`); app-level listeners close their subscriptions (`main.dart:30-53`, `expiry_notification_listener.dart:48-56`); the notification payload is navigation-only (`local_notifications.dart:117-130`); and the text-scale clamp was genuinely removed (`main.dart:64-88`).

- **BLOCKER — auto-connect has no UI caller.** See Top Fix 1. `setAutoConnect()` is dead production code; the persisted preference is permanently false and the startup listener can never connect. This is a user task (`включить автоподключение`) that cannot be completed at all.
- **BLOCKER — no logout UI.** See Top Fix 3. `authNotifier.logout()` is unreachable from any widget; account switching/session end is impossible without Reset Demo.
- **BLOCKER — Android 13+ notification permission is never requested.** See Top Fix 2. The phase's primary notification deliverable can be silently non-functional on common Android versions with no in-app state or recovery.
- **WARNING — SnackBar undo window is 1s shorter than the delete window.** `devices_sheet.dart:78-89` uses a `SnackBar` with no explicit duration → Flutter's 4s default, while `deferred_delete_controller.dart:19` waits 5s. During the final second the row still reads «Отключается» at 0.6 opacity (`devices_sheet.dart:189-200`) but the «Вернуть» action has vanished, so the user loses the only undo affordance. Fix: `duration: const Duration(seconds: 5)` on the undo SnackBar, ideally derived from `_controller.window`.
- **WARNING — device list has no loading feedback and no error recovery.** `devices_sheet.dart:120` collapses loading to `SizedBox.shrink()` (the section simply disappears mid-fetch), and `:121-126` renders a red notice with no retry. The phase's own seed/error table calls for a «Повторить» pattern; add a compact progress indicator and `onRetry: () => ref.invalidate(devicesProvider)`.
- **WARNING — tappable copy/reset rows are not marked as buttons for screen readers.** The e3d6e20 pass added `Semantics(button: true)` to header icons and the device-remove button, but `_CopyAction`'s `InkWell` (`settings/referral_row.dart:89-102`) and the reset `InkWell` (`settings/reset_row.dart:41-58`) have no `button: true`, so TalkBack/VoiceOver announce them as static text. Fix: wrap each with `Semantics(button: true, label: ...)` while preserving the visible label.
- **WARNING — paid upgrade is offered before it can work.** `devices_sheet.dart:162-166` always renders «Увеличить лимит», including when there is no active key or the subscription failed to load; the request then fails server-side and the user only sees a generic mapped toast. Gate the button on a loaded subscription with an active key.
- **INFO — runtime verification gap.** No screenshots, no device screen reader and no on-device notification firing were available in this audit; nothing here proves appearance, TalkBack output or OS alarm delivery. These remain manual UAT in `22-VALIDATION.md:63-68`.

---

## Files Audited

- `.planning/phases/22-devices-settings-polish-5-days/22-CONTEXT.md` (locked D-01…D-09, discretion clause)
- `.planning/phases/22-devices-settings-polish-5-days/22-01-SUMMARY.md` … `22-05-SUMMARY.md` (actuals, prior fixes `755c2df`, `e3d6e20`)
- `.planning/phases/22-devices-settings-polish-5-days/22-VALIDATION.md` (manual-only items)
- `.planning/seeds/prototype-mobile-client.html`, `.planning/seeds/SEED-001-mobile-client-karing.md` (visual reference; no UI-SPEC exists)
- `mobile/lib/features/profile/profile_sheet.dart`
- `mobile/lib/features/profile/devices/devices_sheet.dart`, `device.dart`, `devices_providers.dart`, `deferred_delete_controller.dart`
- `mobile/lib/features/profile/settings/kill_switch_row.dart`, `referral_row.dart`, `reset_row.dart`
- `mobile/lib/features/servers/widgets/main_header.dart`, `pool_toolbar.dart`, `server_pool_screen.dart` (`networkLabelProvider`, sheet entry)
- `mobile/lib/app/theme.dart`, `mobile/lib/main.dart`
- `mobile/lib/core/notifications/local_notifications.dart`, `expiry_scheduler.dart`, `expiry_notification_listener.dart`
- `mobile/lib/core/settings/auto_connect_listener.dart`, `mobile/lib/core/auth/auth_notifier.dart`, `mobile/android/app/src/main/AndroidManifest.xml` (seam/dead-code evidence)

Registry audit: skipped — no `components.json` and no `22-UI-SPEC.md` registry table, so there are no shadcn/third-party blocks to inspect.
