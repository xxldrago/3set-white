-- Phase 14: Ensure promo clicks owner is nullable (already done in Phase 12) and signup IP hash exists
ALTER TABLE "referral_clicks" ALTER COLUMN "owner_user_id" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signup_ip_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_ip_hash" TEXT;
