-- =============================================
-- Competition rules configuration
-- =============================================

-- Add rules JSONB column with sensible defaults
ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS rules JSONB NOT NULL DEFAULT '{
    "allow_shorts": true,
    "market_filter": "all",
    "max_position_pct": null,
    "transaction_fee_pct": 0
  }'::jsonb;

COMMENT ON COLUMN public.competitions.rules IS 'Competition rules: allow_shorts (bool), market_filter (all|SE|US), max_position_pct (null or 0-100), transaction_fee_pct (0-5)';
