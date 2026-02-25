-- Add change_percent column to stock_price_cache
ALTER TABLE stock_price_cache ADD COLUMN IF NOT EXISTS change_percent NUMERIC;
