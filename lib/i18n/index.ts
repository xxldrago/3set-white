import { ru, type I18nKey } from './messages/ru';

export type { I18nKey };
export { ru };

function lookup(key: string): string | undefined {
  let node: unknown = ru;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Typed RU lookup with optional `{token}` interpolation. Unknown keys fall
 * back to the key itself so a missing entry degrades visibly instead of
 * crashing; the completeness spec (tests/unit/i18n.test.ts) fails the build
 * on any missing or unused key.
 */
export function t(key: I18nKey, params?: Record<string, string | number>): string {
  const raw = lookup(key) ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in params ? String(params[name]) : `{${name}}`,
  );
}

/**
 * RU plural helper: resolves `<base>One` / `<base>Few` / `<base>Many` using
 * Intl.PluralRules('ru') (1→one, 2→few, 5→many, 11→many, 21→one). The
 * dictionary holds the perfect-form triplets only — there is no bare `base`.
 */
export function tp(base: string, n: number): string {
  const category = new Intl.PluralRules("ru").select(n); // one | few | many | other
  const suffix = category === "one" ? "One" : category === "few" ? "Few" : "Many";
  return t(`${base}${suffix}` as I18nKey, { n });
}
