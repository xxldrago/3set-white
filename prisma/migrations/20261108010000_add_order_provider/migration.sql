-- Add provider column to orders table (Phase 16: parallel payment providers)
ALTER TABLE "orders" ADD COLUMN "provider" VARCHAR(20);
