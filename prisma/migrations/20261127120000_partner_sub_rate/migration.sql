-- Per-subpartner rate chosen by the upline partner (share of the partner's
-- income paid to that subpartner). Null = fall back to the partner's global
-- downline rate / the site defaults.
ALTER TABLE "users" ADD COLUMN "partner_rate_kind" TEXT;
ALTER TABLE "users" ADD COLUMN "partner_rate_value" INTEGER;
