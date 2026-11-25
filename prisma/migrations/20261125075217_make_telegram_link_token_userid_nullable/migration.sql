-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "provider" SET DATA TYPE TEXT,
ALTER COLUMN "platega_merchant" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "telegram_link_tokens" ALTER COLUMN "user_id" DROP NOT NULL;
