-- Multiple partner links: a partner owns any number of named codes, each
-- attributing registrations either to the partner (own link) or to one of
-- their direct subpartners. Codes share the users.referral_code shape.
CREATE TABLE "referral_links" (
    "id" TEXT NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "target_user_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referral_links_code_key" ON "referral_links"("code");
CREATE INDEX "referral_links_owner_id_created_at_idx" ON "referral_links"("owner_id", "created_at");
CREATE INDEX "referral_links_target_user_id_idx" ON "referral_links"("target_user_id");

ALTER TABLE "referral_links" ADD CONSTRAINT "referral_links_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral_links" ADD CONSTRAINT "referral_links_target_user_id_fkey"
    FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
