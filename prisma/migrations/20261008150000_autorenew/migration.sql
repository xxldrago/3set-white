-- Balance auto-renew flag on cached keys
ALTER TABLE "keys_cache" ADD COLUMN "auto_renew" BOOLEAN NOT NULL DEFAULT false;
