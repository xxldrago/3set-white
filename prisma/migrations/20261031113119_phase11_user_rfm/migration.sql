-- CreateTable
CREATE TABLE "user_rfm" (
    "user_id" INTEGER NOT NULL,
    "recency_days" INTEGER NOT NULL,
    "frequency" INTEGER NOT NULL,
    "monetary" INTEGER,
    "segment" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_rfm_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "user_rfm_segment_idx" ON "user_rfm"("segment");

-- AddForeignKey
ALTER TABLE "user_rfm" ADD CONSTRAINT "user_rfm_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
