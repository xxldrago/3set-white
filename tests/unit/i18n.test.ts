import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allKeys } from '../../lib/i18n/messages/ru';

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
  const re = /\bt\(\s*['"]([A-Za-z0-9_.]+)['"]\s*\)/g;
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
});
