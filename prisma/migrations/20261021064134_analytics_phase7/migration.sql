-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "provider_cost" INTEGER;

-- CreateTable
CREATE TABLE "daily_metrics" (
    "day" DATE NOT NULL,
    "paid_orders" INTEGER NOT NULL DEFAULT 0,
    "paid_cash_rub" INTEGER NOT NULL DEFAULT 0,
    "new_orders" INTEGER NOT NULL DEFAULT 0,
    "renew_orders" INTEGER NOT NULL DEFAULT 0,
    "upgrade_orders" INTEGER NOT NULL DEFAULT 0,
    "provider_cost_rub" INTEGER NOT NULL DEFAULT 0,
    "provider_cost_orders" INTEGER NOT NULL DEFAULT 0,
    "active_keys" INTEGER NOT NULL DEFAULT 0,
    "new_users" INTEGER NOT NULL DEFAULT 0,
    "goodwill_days" INTEGER NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_metrics_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "artemida_balance_snapshots" (
    "day" DATE NOT NULL,
    "balance_rub" INTEGER NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'cron',
    "capturedFrom" TEXT,

    CONSTRAINT "artemida_balance_snapshots_pkey" PRIMARY KEY ("day")
);
