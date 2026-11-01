-- Phase 12: data quality events table (append-only)
CREATE TABLE "data_quality_events" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "msk_day" DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "data_quality_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "data_quality_events_msk_day_idx" ON "data_quality_events"("msk_day");
CREATE INDEX "data_quality_events_resolved_at_idx" ON "data_quality_events"("resolved_at");
