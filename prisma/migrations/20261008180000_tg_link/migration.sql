-- Bot deep-link Telegram linking tokens
-- CreateTable
CREATE TABLE "telegram_link_tokens" (
    "token" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "telegram_id" BIGINT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_tokens_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "telegram_link_tokens_user_id_created_at_idx" ON "telegram_link_tokens"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
