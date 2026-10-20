-- CreateTable
CREATE TABLE "ticket_compensations" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "admin_telegram_id" BIGINT NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "request_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_compensations_request_id_key" ON "ticket_compensations"("request_id");

-- CreateIndex
CREATE INDEX "ticket_compensations_ticket_id_created_at_idx" ON "ticket_compensations"("ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "ticket_compensations" ADD CONSTRAINT "ticket_compensations_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
