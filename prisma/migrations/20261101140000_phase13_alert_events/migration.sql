-- Phase 13: Alert events table
CREATE TABLE "alert_events" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'firing',
  "window_label" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'warning',
  "message" TEXT NOT NULL,
  "fired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "threshold_at_firing" TEXT,
  "actual_value" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "alert_events_type_window_label_key" ON "alert_events"("type", "window_label");
CREATE INDEX "alert_events_status_idx" ON "alert_events"("status");
CREATE INDEX "alert_events_type_idx" ON "alert_events"("type");
CREATE INDEX "alert_events_fired_at_idx" ON "alert_events"("fired_at");
CREATE INDEX "alert_events_status_fired_at_idx" ON "alert_events"("status", "fired_at");
CREATE INDEX "alert_events_window_label_idx" ON "alert_events"("window_label");
