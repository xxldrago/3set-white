-- AlterTable
ALTER TABLE "keys_cache" ADD COLUMN     "customer_ref" TEXT,
ADD COLUMN     "device_limit" INTEGER,
ADD COLUMN     "devices" INTEGER,
ADD COLUMN     "is_trial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_synced_at" TIMESTAMP(3),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "subscription_url" TEXT,
ADD COLUMN     "traffic_limit_bytes" BIGINT,
ADD COLUMN     "traffic_used_bytes" BIGINT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "trial_key_id" TEXT,
ADD COLUMN     "trial_used" BOOLEAN NOT NULL DEFAULT false;
