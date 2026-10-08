-- Admin roles PG-enum → TEXT with a USING cast (roles preserved); future
-- roles never need a non-transactional ALTER TYPE ... ADD VALUE.
-- (users.custom_inviter_kind + promo_codes.owner_user_id arrived in
-- 20261008160000_partner.)
ALTER TABLE "admin_users" ALTER COLUMN "role" TYPE TEXT USING "role"::text;
DROP TYPE "AdminRole";
