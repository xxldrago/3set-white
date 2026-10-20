// Source contracts for the ticket tools (compensation panel, reply templates and
// requester context). These are cheap structural guards for behavior that is
// expensive to exercise without a browser: the panel must post to the
// compensation route with an idempotent requestId, templates must come from the
// shared module, and the context block must degrade keys/payments independently.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), 'utf8');

const COMPENSATION_SOURCE = read('components/admin/TicketCompensation.tsx');
const COMPOSER_SOURCE = read('components/admin/AdminReplyComposer.tsx');
const CONTEXT_SOURCE = read('components/admin/TicketClientContext.tsx');
const PAGE_SOURCE = read('app/admin/tickets/[id]/page.tsx');

describe('ticket compensation panel', () => {
  it('posts to the compensate route with an idempotent requestId', () => {
    expect(COMPENSATION_SOURCE).toContain('/compensate');
    expect(COMPENSATION_SOURCE).toContain('AdminConfirmPanel');
    expect(COMPENSATION_SOURCE).toContain('requestId');
    expect(COMPENSATION_SOURCE).toContain('setRequestId(newRequestId())');
  });

  it('bounds the grant by the per-grant and per-ticket caps', () => {
    expect(COMPENSATION_SOURCE).toContain('COMPENSATION_MAX_DAYS');
    expect(COMPENSATION_SOURCE).toContain('remaining');
    expect(COMPENSATION_SOURCE).toContain('disabled={!valid}');
  });
});

describe('reply templates', () => {
  it('is backed by the shared template module', () => {
    expect(COMPOSER_SOURCE).toContain('TICKET_TEMPLATES');
    expect(COMPOSER_SOURCE).toContain("t('admin.templatesLabel')");
    expect(COMPOSER_SOURCE).toContain("t('admin.templatesInsert')");
  });
});

describe('requester context', () => {
  it('loads keys and payments independently so one failure cannot blank both', () => {
    expect(CONTEXT_SOURCE).toContain('Promise.allSettled');
    expect(CONTEXT_SOURCE).toContain('loadAdminKeys');
    expect(CONTEXT_SOURCE).toContain('loadAdminPayments');
  });
});

describe('ticket detail page', () => {
  it('renders the context and compensation blocks for a requester', () => {
    expect(PAGE_SOURCE).toContain('TicketClientContext');
    expect(PAGE_SOURCE).toContain('TicketCompensation');
    expect(PAGE_SOURCE).toContain('loadTicketCompensationSummary');
    expect(PAGE_SOURCE).toContain("t('admin.ticketContextTitle')");
  });
});
