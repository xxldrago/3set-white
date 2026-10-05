// Minimal seed (D-08): connectivity check + one deterministic test user.
// Idempotent via upsert — safe to re-run. Uses a clearly-fake telegram id
// that can never collide with a real user. Prints an upsert confirmation
// line consumed by the plan's verify chain.
import { prisma } from "../lib/prisma";

const TEST_TELEGRAM_ID = BigInt(100000001);

async function main() {
  await prisma.$connect();
  const user = await prisma.user.upsert({
    where: { telegramId: TEST_TELEGRAM_ID },
    update: { firstName: "Seed", lastName: "User", username: "seed_test_user" },
    create: {
      telegramId: TEST_TELEGRAM_ID,
      chatId: TEST_TELEGRAM_ID,
      firstName: "Seed",
      lastName: "User",
      username: "seed_test_user",
    },
  });
  console.log(`seed: upserted test user (telegram_id=${user.telegramId?.toString() ?? "null"})`);
}

main()
  .catch((e: unknown) => {
    console.error("seed: failed", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
