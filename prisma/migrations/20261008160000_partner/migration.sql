-- Partner program: per-user rate kind + personal promo attribution
ALTER TABLE "users" ADD COLUMN "custom_inviter_kind" TEXT;
ALTER TABLE "promo_codes" ADD COLUMN "owner_user_id" INTEGER;
CREATE INDEX "promo_codes_owner_user_id_idx" ON "promo_codes"("owner_user_id");
