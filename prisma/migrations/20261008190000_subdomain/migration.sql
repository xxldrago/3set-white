-- Partner personal subdomains
ALTER TABLE "users" ADD COLUMN "custom_subdomain" TEXT;
CREATE UNIQUE INDEX "users_custom_subdomain_key" ON "users"("custom_subdomain");
