import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allKeys } from '../../lib/i18n/messages/ru';
import { t, tp } from '../../lib/i18n';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SCAN_DIRS = ['app', 'components', 'lib'].map((d) => join(ROOT, d));

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules') continue;
      collectSourceFiles(full, out);
    } else if (/\.(tsx?|mts)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** All t('a.b.c') / t("a.b.c") literals referenced in source. */
function collectUsedKeys(): string[] {
  const files = SCAN_DIRS.flatMap((d) => collectSourceFiles(d));
  const used = new Set<string>();
  // Widen the params argument: t('key') AND t('key', { n }) / t("key", params).
  const re = /\bt\(\s*['"]([A-Za-z0-9_.]+)['"][^)]*\)/g;
  // Plural calls resolve a <base>One/Few/Many triplet, never the bare base.
  const rePlural = /\btp\(\s*['"]([A-Za-z0-9_.]+)['"]/g;
  for (const file of files) {
    // Skip the dictionary + helper themselves: they contain every key by construction.
    if (
      file.endsWith('lib/i18n/messages/ru.ts') ||
      file.endsWith('lib/i18n/index.ts')
    ) {
      continue;
    }
    const src = readFileSync(file, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) used.add(m[1]);
    while ((m = rePlural.exec(src)) !== null) {
      const base = m[1];
      used.add(`${base}One`);
      used.add(`${base}Few`);
      used.add(`${base}Many`);
    }
  }
  return [...used];
}

describe('i18n key completeness', () => {
  it('dictionary has no empty values', () => {
    const entries = allKeys();
    expect(entries.length).toBeGreaterThan(0);
  });

  it('every t() key used in source exists in the RU dictionary', () => {
    const dict = new Set(allKeys());
    const missing = collectUsedKeys().filter((k) => !dict.has(k));
    expect(missing, `missing i18n keys: ${missing.join(', ')}`).toEqual([]);
  });

  it('dictionary has no unused keys', () => {
    const used = new Set(collectUsedKeys());
    const unused = allKeys().filter((k) => !used.has(k));
    expect(unused, `unused i18n keys: ${unused.join(', ')}`).toEqual([]);
  });

  it('interpolates {token} params and preserves unknown tokens', () => {
    expect(t('pricing.price', { price: 120 })).toBe('120 ₽');
    expect(t('pricing.price', { price: '49' })).toBe('49 ₽');
    expect(t('pricing.price', {})).toBe('{price} ₽');
  });

  it('resolves RU plural categories via tp()', () => {
    // No dictionary triplets exist for this fixture base, so t() falls back to
    // the key path and exposes which suffix Intl.PluralRules('ru') chose.
    expect(tp('x.count', 1)).toBe('x.countOne');
    expect(tp('x.count', 2)).toBe('x.countFew');
    expect(tp('x.count', 5)).toBe('x.countMany');
    expect(tp('x.count', 11)).toBe('x.countMany');
    expect(tp('x.count', 21)).toBe('x.countOne');
    expect(tp('x.count', 22)).toBe('x.countFew');
    expect(tp('x.count', 25)).toBe('x.countMany');
  });
});
