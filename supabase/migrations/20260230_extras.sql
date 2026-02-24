-- ============================================================
-- Extras: Trade History, Season Scores, Show Holdings
-- ============================================================

-- 1. Add realized_pnl_sek to trades
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS realized_pnl_sek NUMERIC;

-- 2. Season scores table
CREATE TABLE public.season_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  final_rank INTEGER NOT NULL,
  final_value NUMERIC NOT NULL,
  final_return_percent NUMERIC NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  UNIQUE(team_id, competition_id)
);
ALTER TABLE public.season_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view season_scores"
  ON public.season_scores FOR SELECT TO authenticated USING (true);

-- 3. Show holdings setting on competitions
ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS show_holdings TEXT NOT NULL DEFAULT 'after_end'
  CHECK (show_holdings IN ('always', 'never', 'after_end'));
