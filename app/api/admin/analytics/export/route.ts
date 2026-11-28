// GET /api/admin/analytics/export?period=7|30|90 — CSV of the analytics
// snapshot (administrator + manager). Same read model as the page, so the file
// and the screen can never disagree.
import { requireRole } from "@/lib/admin-auth";
import { loadAdminAnalytics, type AnalyticsPeriod } from "@/lib/admin-analytics";
import { logger } from "@/lib/logger";
import { AdminError, SessionError } from "@/lib/session";

export const dynamic = "force-dynamic";

function csvCell(value: string | number): string {
  const text = String(value);
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole("administrator", "manager");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-analytics-export", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  const url = new URL(req.url);
  const raw = Number(url.searchParams.get("period") ?? 30);
  const period: AnalyticsPeriod = raw === 7 || raw === 90 ? raw : 30;

  try {
    const data = await loadAdminAnalytics(period, "all");
    const k = data.kpi;
    const rows: (string | number)[][] = [
      ["metric", "value", "window_from", "window_to"],
      ["registrations", k.registrations, data.window.from, data.window.to],
      ["active_keys", k.activeKeys, data.window.from, data.window.to],
      ["active_users", k.activeUsers, data.window.from, data.window.to],
      ["total_users", k.totalUsers, data.window.from, data.window.to],
      ["devices", k.devices, data.window.from, data.window.to],
      ["device_slots", k.deviceSlots, data.window.from, data.window.to],
      ["revenue_rub", k.revenue, data.window.from, data.window.to],
      ["prev_revenue_rub", k.prevRevenue, data.window.from, data.window.to],
      ["partner_revenue_rub", k.partnerRevenue, data.window.from, data.window.to],
      ["referrals", k.referrals, data.window.from, data.window.to],
      ["referral_clicks", k.refClicks, data.window.from, data.window.to],
      ["promo_uses", k.promoUses, data.window.from, data.window.to],
      ["promo_discount_rub", k.promoDiscount, data.window.from, data.window.to],
      ["trials_issued_new_accounts", k.trialIssued, data.window.from, data.window.to],
      ["trials_active_now", k.trialActive, data.window.from, data.window.to],
      ["trials_converted", k.trialConverted, data.window.from, data.window.to],
      ["orders_created", k.ordersCreated, data.window.from, data.window.to],
      ["orders_paid", k.paidOrdersInWindow, data.window.from, data.window.to],
      ["orders_overdue_24h", k.overdue, data.window.from, data.window.to],
      ["mrr_rub", data.money?.mrr ?? "", "current", "current"],
      ["arr_rub", data.money?.arr ?? "", "current", "current"],
      ["arpu_rub", data.money?.arpu ?? "", data.window.from, data.window.to],
      ["arppu_rub", k.arppu ?? "", data.window.from, data.window.to],
    ];

    const csv = rows.map((row) => row.map(csvCell).join(";")).join("\n");
    return new Response(`\ufeff${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="3set-analytics-${period}d.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    logger.error({ route: "admin-analytics-export", outcome: "load_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
