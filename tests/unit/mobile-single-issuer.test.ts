// REQ-BE-05 supersession guard + REQ-BE-07 invariant lock (D-04/D-07).
//
// Source-level regression test: it reads the real files through node:fs (no
// shell grep) so a later change cannot quietly add a SECOND key issuer or
// weaken the shared webhook. No secret, payment URL, transaction id or
// provider text is read, logged or printed by any assertion here.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

/** Every TypeScript route file under the mobile BFF, recursively. */
function mobileRouteFiles(dir = "app/api/mobile"): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const relativePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...mobileRouteFiles(relativePath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      found.push(relativePath);
    }
  }
  return found;
}

describe("single key issuer (REQ-BE-05 superseded / D-04 / D-07)", () => {
  it("exposes no client-callable key issue/renew route under /api/mobile", () => {
    const offenders: string[] = [];
    for (const file of mobileRouteFiles()) {
      const text = source(file);
      if (/(^|\/)keys\/(issue|renew)\b/.test(file)) {
        offenders.push(`${file}: issue/renew route path`);
      }
      if (/\/keys\/(issue|renew)\b/.test(text)) {
        offenders.push(`${file}: issue/renew route declaration`);
      }
      if (/\b(createKey|issueKey|renewKey|upgradeKey)\s*\(/.test(text)) {
        offenders.push(`${file}: direct key-issue call`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps header verification, re-query and amount/currency checks in the webhook", () => {
    const callback = source("app/api/platega/callback/route.ts");

    // Public boundary: headers are verified BEFORE the body is parsed.
    expect(callback).toContain("detectPlategaMerchant(req.headers)");
    expect(callback).toContain('return new Response("Unauthorized", { status: 401 })');
    expect(callback.indexOf("detectPlategaMerchant(req.headers)")).toBeLessThan(
      callback.indexOf("await req.json()"),
    );

    // The callback is a hint only: the provider is always re-queried.
    expect(callback).toContain("plategaClientFor(merchant).getTransaction(parsed.data.id)");

    // CONFIRMED alone is not enough: amount AND currency must match our order.
    expect(callback).toContain("amountMatches(tx.amount, expected)");
    expect(callback).toContain("tx.currency !== order.currency");

    // Non-issuing statuses never reach the claim.
    expect(callback).toContain('tx.status === "CHARGEBACKED"');
    expect(callback).toContain('tx.status === "DISPUTED"');
    expect(callback).toContain('tx.status !== "CONFIRMED"');

    // The webhook itself never provisions: it only claims and acks fast.
    expect(callback).toContain("applyConfirmedPayment(order.id)");
    expect(callback).not.toMatch(/\b(createKey|upgradeKey|markProvisioned)\s*\(/);
    expect(callback).toContain('new Response("OK", { status: 200 })');

    // No money data or secret can leak from this boundary.
    expect(callback).not.toMatch(/paymentUrl|accessToken|refreshToken/);
  });

  it("claims atomically and enqueues exactly one fulfillment row", () => {
    const orders = source("lib/orders-service.ts");
    const claim = 'transitionOrder(orderId, "pending", "paid"';
    const enqueue = "await enqueueFulfillOrder(orderId)";

    expect(orders).toContain(claim);
    expect(orders).toContain("if (!claimed) return false;");
    expect(orders).toContain(enqueue);
    // The enqueue is strictly AFTER a successful atomic claim: a duplicate
    // CONFIRMED delivery can never produce a second job.
    expect(orders.indexOf(enqueue)).toBeGreaterThan(orders.indexOf(claim));
    expect(orders).toMatch(
      /export async function enqueueFulfillOrder[\s\S]{0,200}enqueueFulfillJob\(orderId\)/,
    );

    const outbox = source("lib/outbox.ts");
    expect(outbox).toContain("prisma.outbox.upsert(");
    expect(outbox).toContain("where: { orderId_type: { orderId, type } }");
    expect(outbox).toContain("update: {}");
  });

  it("keeps the worker's deterministic per-order idempotency key", () => {
    const worker = source("lib/worker.ts");
    expect(worker).toContain("const idempotencyKey = `order:${order.id}:${order.kind}`");
    expect(worker).toContain("{ idempotencyKey }");
  });
});
