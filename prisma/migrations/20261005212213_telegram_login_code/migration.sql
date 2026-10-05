-- AlterTable
ALTER TABLE "telegram_login_tokens" ADD COLUMN     "code_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "code_hash" TEXT;
