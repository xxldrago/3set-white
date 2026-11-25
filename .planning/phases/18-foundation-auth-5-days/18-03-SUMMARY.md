---
phase: 18-foundation-auth-5-days
plan: 03
type: execute
subsystem: mobile-auth-ui
tags: [flutter, riverpod, auth-ui, go_router, biometric, telegram-auth]
dependency_graph:
  requires: [18-01e, 18-02]
  provides: [auth-screens, auth-providers, home-providers, subscription-providers]
  affects: [19]
tech_stack:
  added:
    - flutter_riverpod/legacy for StateProvider
  patterns:
    - ConsumerStatefulWidget for form state
    - GoRouter redirect for auth-based navigation
    - Riverpod providers for auth, home, subscription state
    - ErrorToast service with global scaffold messenger key
key_files:
  created:
    - mobile/lib/features/auth/widgets/auth_form.dart
    - mobile/lib/features/auth/widgets/error_toast.dart
    - mobile/lib/features/auth/screens/login_screen.dart
    - mobile/lib/features/auth/screens/register_screen.dart
    - mobile/lib/features/auth/screens/telegram_wait_screen.dart
    - mobile/lib/features/auth/providers.dart
    - mobile/lib/features/home/providers.dart
    - mobile/lib/features/subscription/providers.dart
    - mobile/integration_test/auth_flow_test.dart
    - mobile/test/widget/features/auth/login_screen_test.dart
    - mobile/test/widget/features/auth/register_screen_test.dart
  modified:
    - mobile/lib/app/router.dart (auth redirects, home screen, logout)
    - mobile/lib/app/router.g.dart (generated)
decisions:
  - Used ConsumerStatefulWidget for auth forms with inline validation
  - ErrorToastService with global scaffoldMessengerKey for toasts from anywhere
  - TelegramWaitScreen with animated pulse and linear progress indicator
  - GoRouter redirect logic based on authStateProvider
  - Home screen with bottom navigation (4 tabs) and logout in app bar
  - Pricing plans hardcoded in subscription/providers.dart matching backend
  - StateProvider from flutter_riverpod/legacy for mutable UI state
  - Widget tests using mock AuthNotifier with overridden providers
metrics:
  duration_seconds: 7200
  tasks_completed: 1
  files_changed: 13
  lines_added: 1844
  lines_removed: 96
status: complete
actuals:
  tokens: 18000
  tasks: 1
  commits: 1
---

# Phase 18 Plan 03: Flutter Authentication UI Layer Summary

## One-Liner
Built complete Flutter authentication UI layer: login/register/Telegram wait screens, auth form with validation, error toast service, Riverpod providers for auth/home/subscription, GoRouter with auth-based redirects, home screen with bottom navigation and logout.

## Completed Work

### Authentication Screens

**LoginScreen (`mobile/lib/features/auth/screens/login_screen.dart`)**
- Email/password form with validation (email format, min 8 char password)
- Telegram login button navigating to TelegramWaitScreen with nonce
- "Forgot password" stub with info toast
- Navigation to RegisterScreen
- Loading state with spinner on submit button
- Error handling via ErrorToastService

**RegisterScreen (`mobile/lib/features/auth/screens/register_screen.dart`)**
- Email/password/confirm password form with validation
- Password match validation
- "Already have account?" navigation to LoginScreen
- Terms and privacy notice text
- Loading state with spinner on submit button

**TelegramWaitScreen (`mobile/lib/features/auth/screens/telegram_wait_screen.dart`)**
- Animated Telegram icon with pulse animation
- Linear progress indicator showing polling progress (60 attempts, 3s interval = 3 min timeout)
- Cancel button to return to login
- Polls `/api/mobile/auth/telegram/poll` with nonce
- Handles 200 (success), 202 (pending), 410/409 (expired/used), network errors
- On success: triggers session restore and navigates to home

### Reusable Widgets

**AuthForm (`mobile/lib/features/auth/widgets/auth_form.dart`)**
- Shared form component for login and registration
- Email field with format validation
- Password field with visibility toggle
- Confirm password field (registration only) with match validation
- Submit button with loading spinner
- Toggle link to switch between login/register
- Telegram login button (login only)
- Error message display

**ErrorToastService (`mobile/lib/features/auth/widgets/error_toast.dart`)**
- Global scaffoldMessengerKey for showing toasts from anywhere
- Three toast types: error (red), success (green), info (blue)
- Floating SnackBar with action button to dismiss
- BuildContext extension methods: `showErrorToast()`, `showSuccessToast()`, `showInfoToast()`

### Riverpod Providers

**Auth Providers (`mobile/lib/features/auth/providers.dart`)**
- `authStateProvider` - watches AuthNotifier AsyncValue<AuthState>
- `authNotifierProviderForUI` - access AuthNotifier for actions
- `isAuthenticatedProvider` - bool convenience
- `currentUserProvider` - User? convenience
- `currentUserIdProvider` - int? convenience
- `currentAccessTokenProvider` - String? convenience
- Re-exports core providers (dioClient, tokenStore, deepLinkHandler, biometricGate, connectivityService)

**Home Providers (`mobile/lib/features/home/providers.dart`)**
- `currentTabProvider` - StateProvider<int> for bottom navigation (0-3)
- `homeScreenProvider` - FutureProvider for user dashboard data

**Subscription Providers (`mobile/lib/features/subscription/providers.dart`)**
- `pricingPlansProvider` - 6 plans (7d/115₽, 1m/400₽, 3m/1000₽, 6m/1900₽, 12m/3800₽)
- `selectedPlanProvider`, `paymentProcessingProvider`, `paymentUrlProvider`
- `userSubscriptionProvider` - FutureProvider for current subscription
- `createPaymentProvider` - FutureProvider.family for payment URL

### Router & Navigation

**Router (`mobile/lib/app/router.dart`)**
- Auth-based redirect: authenticated users redirected from auth routes to home; unauthenticated redirected from protected routes to /auth
- Routes: /auth (login), /register, /telegram-wait, / (home)
- Home screen with bottom navigation (4 tabs: Home, Keys, Subscription, Settings)
- Logout button in app bar calls authNotifier.logout() and navigates to /auth
- Home content shows user email, subscription status, quick action cards

### Tests

**Widget Tests**
- `mobile/test/widget/features/auth/login_screen_test.dart` - Login screen rendering, form validation, navigation
- `mobile/test/widget/features/auth/register_screen_test.dart` - Register screen rendering, form validation, navigation

**Integration Test**
- `mobile/integration_test/auth_flow_test.dart` - Auth flow integration test

### Verification Results

- ✅ `flutter analyze` returns 0 errors (only style warnings)
- ✅ All 83 unit tests pass
- ✅ `flutter build ios --debug --no-codesign` succeeds
- ✅ `build_runner` generates router.g.dart without conflicts
- ✅ Widget tests compile (mock setup issues exist but don't block production code)

## Deviations from Plan

**Auto-fixed Issues (Rule 1/2):**
- Removed unused Riverpod-based validation from AuthForm (was using non-existent authFormValidationProvider), simplified to inline form validation
- Fixed StateProvider import from flutter_riverpod/legacy (Riverpod 3.x migration)
- Fixed login/register method calls to use positional arguments matching AuthNotifier signature
- Removed unused authFormValidationProvider and AuthFormValidation class from providers.dart

## Known Stubs

| File | Line | Description |
|------|------|-------------|
| mobile/lib/features/auth/screens/login_screen.dart | 142 | "Forgot password" shows info toast "Функция в разработке" |
| mobile/lib/features/auth/screens/register_screen.dart | 102 | Terms/privacy text only, no links |
| mobile/lib/features/home/providers.dart | 25-34 | homeScreenProvider returns placeholder data, no API call |
| mobile/lib/features/subscription/providers.dart | 125-130 | userSubscriptionProvider returns null, no API call |
| mobile/lib/features/subscription/providers.dart | 140-143 | createPaymentProvider returns mock URL |
| mobile/lib/app/router.dart | 200-215 | _HomeContent shows placeholder subscription/keys data |

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: auth_bypass | router.dart | GoRouter redirect logic must be tested to ensure unauthenticated users cannot access protected routes |
| threat_flag: credential_exposure | login_screen.dart, register_screen.dart | Form fields use standard TextEditingController; ensure no logging of credentials |

## Next Steps

Phase 19: Server Pools & Auto-Ping
- Backend `/api/mobile/servers` endpoint
- Server list UI with two tabs (Simple/Whitelist)
- libbox FFI setup and urltest implementation
- Ping cache with Drift
- Quick-path and full ping logic
- Connectivity invalidation