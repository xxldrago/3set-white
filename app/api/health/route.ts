// GET /api/health — shallow liveness probe (OPS-01 / D-78).
//
// Deliberately minimal: no DB round-trip, no env values, no version string, no
// token (T-05-21). Reports `{ status, uptime, worker }` so Nginx / Docker
// compose / uptime monitors have a cheap 200. `worker` reflects the globalThis
// handle set by `startWorker()` in lib/worker.ts; when absent it is `false` and
// the endpoint still returns 200 (a down worker must not fail liveness).
export const dynamic = "force-dynamic";

interface WorkerGlobal {
  __setwhiteWorker?: { started?: boolean };
}

export async function GET(): Promise<Response> {
  const g = globalThis as unknown as WorkerGlobal;
  return Response.json({
    status: "ok",
    uptime: process.uptime(),
    worker: g.__setwhiteWorker?.started === true,
  });
}
