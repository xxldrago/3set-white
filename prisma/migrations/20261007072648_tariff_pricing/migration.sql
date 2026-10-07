-- CreateTable
CREATE TABLE "tariff_prices" (
    "id" SERIAL NOT NULL,
    "days" INTEGER NOT NULL,
    "devices" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "updated_by_telegram_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tariff_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tariff_prices_days_devices_key" ON "tariff_prices"("days", "devices");
