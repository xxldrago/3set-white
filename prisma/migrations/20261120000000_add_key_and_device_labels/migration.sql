-- Local display labels for keys and devices.
--
-- The ARTEMIDA API has no rename endpoint (PATCH/PUT /keys/{id} return 501 and
-- /keys/{id}/rename 404), and its own `name` is technical (`api_client_...`)
-- and rewritten on every sync. These labels therefore live only in our DB and
-- are joined at render time.

-- Keys: user-chosen label. Deliberately separate from `name`, which mirrors the
-- provider and is overwritten by upsertCachedKey on every refresh.
ALTER TABLE "keys_cache" ADD COLUMN "label" TEXT;

CREATE TABLE "device_labels" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "key_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_labels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_labels_user_id_key_id_token_key"
    ON "device_labels"("user_id", "key_id", "token");

ALTER TABLE "device_labels" ADD CONSTRAINT "device_labels_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
