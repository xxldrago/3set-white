// WR-05 regression (T-06-12-02): consumeWidgetHash must treat ONLY a Prisma
// unique violation (P2002) as a replay. Any other DB failure is logged and
// rethrown, so callers surface a generic 500 instead of a misleading 401.
//
// Real local Postgres (`setwhite` per phase conventions); throwaway hashes
// only; every inserted replay row is removed in beforeAll/afterAll.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { consumeWidgetHash } from "../../lib/replay";

const RUN = Date.now().toString(36);
const HASH_FRESH = `phase6-replay-fresh-${RUN}`;
const HASH_DUP = `phase6-replay-dup-${RUN}`;
const HASH_ERR = `phase6-replay-err-${RUN}`;
const HASHES = [HASH_FRESH, HASH_DUP, HASH_ERR];

async function cleanup(): Promise<void> {
  await prisma.replayCache.deleteMany({ where: { hash: { in: HASHES } } });
}

describe("consumeWidgetHash error discipline (WR-05)", () => {
  beforeAll(cleanup);
  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true on the first consume of a fresh hash", async () => {
    await expect(consumeWidgetHash(HASH_FRESH)).resolves.toBe(true);
    await expect(
      prisma.replayCache.findUnique({ where: { hash: HASH_FRESH } }),
    ).resolves.not.toBeNull();
  });

  it("returns false when the same hash is consumed again (P2002 → replay)", async () => {
    await expect(consumeWidgetHash(HASH_DUP)).resolves.toBe(true);
    await expect(consumeWidgetHash(HASH_DUP)).resolves.toBe(false);
  });

  it("logs and rethrows a non-P2002 DB error instead of reporting a replay", async () => {
    const failure = Object.assign(new Error("connection terminated"), { code: "P1001" });
    const createSpy = vi.spyOn(prisma.replayCache, "create");
    createSpy.mockRejectedValueOnce(failure as never);
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);

    await expect(consumeWidgetHash(HASH_ERR)).rejects.toBe(failure);
    expect(createSpy).toHaveBeenCalledTimes(1);
    // Logged without the hash (PII discipline).
    expect(errorSpy).toHaveBeenCalledWith({ route: "replay", outcome: "error" });
    expect(errorSpy.mock.calls.flat()).not.toContain(HASH_ERR);
  });
});
