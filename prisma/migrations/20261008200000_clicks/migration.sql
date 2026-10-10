-- Referral click funnel
-- CreateTable
CREATE TABLE "referral_clicks" (
    "id" TEXT NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "code" TEXT,
    "ip_hash" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'link',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "referral_clicks_owner_user_id_created_at_idx" ON "referral_clicks"("owner_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "referral_clicks" ADD CONSTRAINT "referral_clicks_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
