-- =============================================
-- Price alerts on watchlist items
-- =============================================

-- Add alert columns to watchlist
ALTER TABLE public.watchlist
  ADD COLUMN IF NOT EXISTS alert_threshold_percent NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_alert_price_sek NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_alerted_at TIMESTAMPTZ DEFAULT NULL;
