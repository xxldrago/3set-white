-- Sub-partner downline rates + bonus-day balances
ALTER TABLE "users" ADD COLUMN "sub_rate_kind" TEXT;
ALTER TABLE "users" ADD COLUMN "sub_rate_value" INTEGER;
ALTER TABLE "users" ADD COLUMN "bonus_days" INTEGER NOT NULL DEFAULT 0;
