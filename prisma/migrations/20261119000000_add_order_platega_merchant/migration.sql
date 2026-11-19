-- Add platega_merchant column to orders table (bot/site dual merchant)
ALTER TABLE "orders" ADD COLUMN "platega_merchant" VARCHAR(10);
