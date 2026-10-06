// GET /api/health — shallow liveness probe (OPS-01 / D-78). No DB round-trip,
// no env/version/token leakage; returns 200 even when the worker global is
// absent. The prisma client is mocked to prove the handler never touches the DB.
import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $connect: vi.fn(),
  user: { count: vi.fn() },
}));

vi.mock("../../lib/prisma", () => ({ prisma: prismaMock }));

import { GET } from "../../app/api/health/route";

type WorkerGlobal = { __setwhiteWorker?: { started?: boolean } };
const g = globalThis as unknown as WorkerGlobal;

afterEach(() => {
  delete g.__setwhiteWorker;
  prismaMock.$queryRaw.mockClear();
  prismaMock.$connect.mockClear();
  prismaMock.user.count.mockClear();
});

describe("GET /api/health", () => {
  it("returns 200 with exactly status, uptime and a worker flag", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["status", "uptime", "worker"]);
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime as number).toBeGreaterThanOrEqual(0);
    expect(body.worker).toBe(false);
  });

  it("reports worker started from the globalThis handle", async () => {
    g.__setwhiteWorker = { started: true };

    const res = await GET();
    const body = (await res.json()) as { worker: boolean };

    expect(res.status).toBe(200);
    expect(body.worker).toBe(true);
  });

  it("leaks no env values/version/token and touches no DB", async () => {
    const res = await GET();
    const raw = JSON.stringify(await res.json());

    expect(raw).not.toContain("unit-test-bot-token");
    expect(raw).not.toContain("unit-test-session-secret");
    expect(raw).not.toContain("unit-test-artemida-key");
    expect(raw).not.toContain("token");
    expect(raw).not.toContain("version");
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(prismaMock.$connect).not.toHaveBeenCalled();
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });
});
