-- Per-plan partner payouts: a partner earns a fixed RUB sum per sold key of a
-- given term (7/30/90/180/365 days). Missing row = custom/global rate.
CREATE TABLE "partner_plan_rewards" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_plan_rewards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "partner_plan_rewards_user_id_days_key" ON "partner_plan_rewards"("user_id", "days");

ALTER TABLE "partner_plan_rewards" ADD CONSTRAINT "partner_plan_rewards_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Promo controls: manual on/off switch, minimum order amount, admin note.
ALTER TABLE "promo_codes" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "promo_codes" ADD COLUMN "min_sum" INTEGER;
ALTER TABLE "promo_codes" ADD COLUMN "note" TEXT;

-- Account block: non-null revokes sessions and is shown in the admin directory.
ALTER TABLE "users" ADD COLUMN "blocked_at" TIMESTAMP(3);
