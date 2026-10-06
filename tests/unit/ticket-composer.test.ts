import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source-contract test for the in-thread reply composer (SUP-01/D-59). The unit
// suite is node-only (no jsdom / React Testing Library), so this mirrors the
// `tests/unit/i18n.test.ts` file-scanning style and asserts the plan's explicit
// `fails_when` conditions at the source level: a reply must POST multipart
// FormData to the in-thread messages route (never JSON / no manual content
// type), lock while in flight, refresh on success, and retain the typed body on
// failure with keyed copy + retry.
const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, '..', '..', 'components', 'TicketComposer.tsx');

function readSource(): string {
  expect(existsSync(SOURCE), `missing ${SOURCE}`).toBe(true);
  return readFileSync(SOURCE, 'utf8');
}

describe('TicketComposer contract', () => {
  it('posts multipart FormData to the in-thread messages route (never JSON)', () => {
    const src = readSource();
    expect(src).toContain('new FormData()');
    expect(src).toContain('/api/tickets/');
    expect(src).toContain('/messages');
    expect(src).toContain("method: 'POST'");
    // A manual content type would break the multipart boundary (D-53/D-55).
    expect(src).not.toContain('Content-Type');
  });

  it('locks while in flight and refreshes the same thread on success', () => {
    const src = readSource();
    expect(src).toContain("setState('loading')");
    expect(src).toContain("t('ticket.submitLoading')");
    expect(src).toContain('router.refresh()');
  });

  it('keeps the typed body on failure with keyed error + retry', () => {
    const src = readSource();
    expect(src).toContain("t('ticket.sendError')");
    expect(src).toContain("t('common.retry')");
    // Input is cleared only after a successful response.
    expect(src).toContain("setBody('')");
  });
});
