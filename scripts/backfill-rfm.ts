// scripts/backfill-rfm.ts — CLI-only history backfill for user_rfm
// (D-12). Never a route, never an admin button: the container entrypoint owns
// the DB (the port is unpublished), the Dockerfile copies scripts/ into the
// runner, and the documented operator command is
// `docker compose -f docker-compose.prod.yml exec web npx tsx scripts/backfill-rfm.ts`.
//
// Imports are RELATIVE here — the `@/` alias does not exist under tsx
// (mirrors prisma/seed.ts and scripts/backfill-analytics.ts).
//
// The engine is the SAME recomputeAllRfm the nightly cron route calls, so
// backfill and nightly can never disagree; the upsert by userId PK makes
// re-runs produce identical results (idempotent).
import { prisma } from "../lib/prisma";
import { recomputeAllRfm } from "../lib/analytics/rfm-service";

async function main(): Promise<void> {
  await prisma.$connect();
  const result = await recomputeAllRfm();
  console.log(`backfill-rfm: users=${result.users} upserted=${result.upserted} computedAt=${result.computedAt.toISOString()}`);
}

main()
  .catch((e: unknown) => {
    console.error("backfill-rfm: failed", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
