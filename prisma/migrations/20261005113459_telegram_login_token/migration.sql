-- CreateTable
CREATE TABLE "telegram_login_tokens" (
    "token" TEXT NOT NULL,
    "ip_hash" TEXT NOT NULL,
    "telegram_id" BIGINT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_login_tokens_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "telegram_login_tokens_expires_at_idx" ON "telegram_login_tokens"("expires_at");
