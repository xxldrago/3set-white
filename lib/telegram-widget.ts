// Telegram Login Widget callback builder (06-08 regression fix).
//
// The Telegram widget parses `data-onauth` as a function BODY:
//   __parseFunction -> eval('(function(user){<value>})')
// so the value MUST be a valid JS call expression whose callee is an
// identifier-only global. The 06-05 regression used
// `window.telegram-login-<bot>-<rand>OnAuth(user)`: hyphens inside a dot path
// parse as subtraction, so invoking it throws `ReferenceError: login is not
// defined` and the callback never fires.
//
// Pure, dependency-free module by design (mirrors lib/auth.ts): no
// next/headers, no env import — importable by the vitest node environment and
// by client components alike.
//
// T-06-08-01: only characters in [A-Za-z0-9_] survive, so the emitted name can
// never re-introduce an operator or a member access.
// T-06-08-02: this module makes no trust decision; the widget payload is still
// verified server-side (HMAC + one-time replay consume) at the BFF boundary.

/**
 * Replace every character outside `[A-Za-z0-9_]` with `_`, then prefix `_` when
 * the result does not start with a letter. The result is always a valid JS
 * identifier fragment (never empty, never digit/operator-leading).
 */
export function sanitizeWidgetIdPart(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z]/.test(sanitized) ? sanitized : `_${sanitized}`;
}

/**
 * Build an identifier-only global callback name for a widget instance. The
 * result always matches `/^[A-Za-z][A-Za-z0-9_]*$/` for any input, so it can be
 * registered on `window` and referenced directly from `data-onauth`.
 */
export function widgetCallbackName(botUsername: string, nonce: string): string {
  return `tgAuth_${sanitizeWidgetIdPart(botUsername)}_${sanitizeWidgetIdPart(nonce)}`;
}

/**
 * Build the `data-onauth` body: a direct identifier call. Never a `window.`
 * dot path and never a member expression — Telegram evals this string as a
 * function body and invokes the named global with the widget payload.
 */
export function widgetOnAuthExpression(callbackName: string): string {
  return `${callbackName}(user)`;
}
