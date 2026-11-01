-- Phase 12: generalize referral_clicks and add IP hashes to users
ALTER TABLE "referral_clicks" ALTER COLUMN "owner_user_id" DROP NOT NULL;
ALTER TABLE "referral_clicks" ADD COLUMN IF NOT EXISTS "promo_code_id" TEXT;
ALTER TABLE "referral_clicks" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'referral';
CREATE INDEX IF NOT EXISTS "referral_clicks_ip_hash_created_at_idx" ON "referral_clicks"("ip_hash", "created_at");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signup_ip_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_ip_hash" TEXT;
