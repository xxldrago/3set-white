-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "unread_for_admin" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "tickets_unread_for_admin_last_message_at_idx" ON "tickets"("unread_for_admin", "last_message_at");
