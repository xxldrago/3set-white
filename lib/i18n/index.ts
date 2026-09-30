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
 * Typed RU lookup. Unknown keys fall back to the key itself so a missing
 * entry degrades visibly instead of crashing; the completeness spec
 * (tests/unit/i18n.test.ts) fails the build on any missing or unused key.
 */
export function t(key: I18nKey): string {
  return lookup(key) ?? key;
}
