# Quick task: ticket compensation, reply templates, client context

## Goal

Give support the tools they need inside a ticket:

1. Grant bonus days as compensation (audited, capped, idempotent).
2. Insert canned reply templates in the admin composer.
3. See the requester's keys and recent payments without leaving the ticket.

## Tasks

- [x] Add `TicketCompensation` model + migration; expose `bonusDays` on the admin profile header.
- [x] Add shared compensation constants and an admin-only service:
      `compensateTicketWithBonusDays` (transaction: compensation row, `User.bonusDays`
      increment, support message, ticket counters) and a summary loader.
- [x] Add `POST /api/admin/tickets/[id]/compensate` (administrator/support,
      zod validation, `requestId` idempotency, enqueue the reply notification).
- [x] Add `TicketCompensation` client panel and render it on the ticket page.
- [x] Add `TicketClientContext` server block with requester keys/payments.
- [x] Add `TICKET_TEMPLATES` + picker to `AdminReplyComposer`.
- [x] Add RU i18n keys and tests (route, service limits/idempotency, UI contracts).
- [x] Verify: `tsc`, full vitest with local Postgres (468/468), eslint on changed files, `next build`.

## Notes

- Shared `lib/prisma-errors.ts` (`isWriteConflict`/`isUniqueViolation`) walks the
  `cause` chain: the Prisma 7 PG adapter wraps serialization failures as
  `DriverAdapterError { cause: { originalCode: '40001' } }`, not top-level `P2034`.

## Constraints

- Compensation credits `User.bonusDays`; users redeem via the existing
  `/api/keys/[keyId]/bonus` route. Trial keys cannot be extended this way.
- Caps: 1–30 days per grant, 90 days per ticket.
- Self-contained migration; no changes to the ARTEMIDA client.
