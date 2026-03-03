-- =============================================
-- Team trade limits: captain-configurable per-trade limit
-- =============================================

-- Add max_trade_sek to teams (null = no limit)
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS max_trade_sek NUMERIC DEFAULT NULL;

COMMENT ON COLUMN public.teams.max_trade_sek IS 'Maximum trade value (SEK) per transaction for non-captain members. NULL = no limit.';
