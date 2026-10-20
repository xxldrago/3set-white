// Error-shape helpers for the Prisma 7 PG driver adapter.
//
// Unlike the classic engine (which raised `P2034` / `P2002` at the top level),
// the adapter wraps the raw Postgres error: a serialization failure arrives as
// `DriverAdapterError { message: 'TransactionWriteConflict', cause: { originalCode: '40001',
// kind: 'TransactionWriteConflict' } }` and a unique violation carries
// `originalCode: '23505'` on the cause. Walk the `cause` chain so both the
// adapter shape and the legacy Prisma codes are recognized.
interface ErrorLike {
  code?: unknown;
  originalCode?: unknown;
  kind?: unknown;
  message?: unknown;
  cause?: unknown;
}

function errorChain(err: unknown): ErrorLike[] {
  const chain: ErrorLike[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) break;
    const node = current as ErrorLike;
    chain.push(node);
    current = node.cause;
  }
  return chain;
}

const WRITE_CONFLICT_CODES = new Set(['P2034', '40001', '40P01']);
const UNIQUE_VIOLATION_CODES = new Set(['P2002', '23505']);

export function isWriteConflict(err: unknown): boolean {
  return errorChain(err).some(
    (node) =>
      WRITE_CONFLICT_CODES.has(String(node.code)) ||
      WRITE_CONFLICT_CODES.has(String(node.originalCode)) ||
      node.kind === 'TransactionWriteConflict' ||
      (typeof node.message === 'string' && node.message.includes('TransactionWriteConflict')),
  );
}

export function isUniqueViolation(err: unknown): boolean {
  return errorChain(err).some(
    (node) =>
      UNIQUE_VIOLATION_CODES.has(String(node.code)) ||
      UNIQUE_VIOLATION_CODES.has(String(node.originalCode)),
  );
}
