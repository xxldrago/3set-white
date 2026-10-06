-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_canonical" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_email_canonical_key" ON "users"("email_canonical");
