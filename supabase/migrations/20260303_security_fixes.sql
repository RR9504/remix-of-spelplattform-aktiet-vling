-- =============================================
-- Security fixes: RLS policies + cash_balance validation
-- =============================================

-- 1. Fix short_positions: restrict INSERT/UPDATE to service role only
-- Drop the overly permissive policies and recreate for service_role
DROP POLICY IF EXISTS "Service role can insert short_positions" ON public.short_positions;
DROP POLICY IF EXISTS "Service role can update short_positions" ON public.short_positions;

-- Service role bypasses RLS anyway, but these explicit policies are needed
-- because RLS is enabled. Restrict to operations via RPC functions (SECURITY DEFINER).
-- Authenticated users can only SELECT.
CREATE POLICY "No direct insert on short_positions"
  ON public.short_positions FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "No direct update on short_positions"
  ON public.short_positions FOR UPDATE TO authenticated
  USING (false);

-- 2. Fix season_scores: restrict INSERT to service role only
DROP POLICY IF EXISTS "Service role can insert season_scores" ON public.season_scores;

CREATE POLICY "No direct insert on season_scores"
  ON public.season_scores FOR INSERT TO authenticated
  WITH CHECK (false);

-- 3. Fix insider_trades_cache: restrict write operations
DROP POLICY IF EXISTS "Service role can insert insider trades" ON public.insider_trades_cache;
DROP POLICY IF EXISTS "Service role can update insider trades" ON public.insider_trades_cache;
DROP POLICY IF EXISTS "Service role can delete insider trades" ON public.insider_trades_cache;

-- Keep SELECT for authenticated only (not anon)
DROP POLICY IF EXISTS "Anyone can read insider trades" ON public.insider_trades_cache;
CREATE POLICY "Authenticated can read insider trades"
  ON public.insider_trades_cache FOR SELECT TO authenticated USING (true);

-- Block direct writes from authenticated users (service role bypasses RLS)
CREATE POLICY "No direct insert on insider_trades_cache"
  ON public.insider_trades_cache FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "No direct update on insider_trades_cache"
  ON public.insider_trades_cache FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "No direct delete on insider_trades_cache"
  ON public.insider_trades_cache FOR DELETE TO authenticated
  USING (false);

-- 4. Validate cash_balance_sek on competition_teams INSERT
-- Ensure it matches the competition's initial_balance
CREATE OR REPLACE FUNCTION public.validate_competition_team_insert()
RETURNS TRIGGER AS $$
DECLARE
  expected_balance NUMERIC;
BEGIN
  SELECT initial_balance INTO expected_balance
  FROM public.competitions
  WHERE id = NEW.competition_id;

  IF expected_balance IS NULL THEN
    RAISE EXCEPTION 'Competition not found';
  END IF;

  -- Force cash_balance_sek to match competition's initial_balance
  NEW.cash_balance_sek := expected_balance;
  -- Reset margin to 0
  NEW.margin_reserved_sek := 0;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_initial_balance ON public.competition_teams;
CREATE TRIGGER enforce_initial_balance
  BEFORE INSERT ON public.competition_teams
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_competition_team_insert();

-- 5. Restrict competition_teams UPDATE to only allow service role to change cash/margin
-- The existing policy allows captains to UPDATE anything. Replace with column-level control.
-- We can't do column-level RLS, so instead we use a trigger to prevent cash tampering.
CREATE OR REPLACE FUNCTION public.protect_competition_team_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow cash_balance_sek and margin_reserved_sek changes via service role
  -- (service role bypasses RLS + triggers can't detect role, but we can check
  -- if the change is coming through our RPC functions by verifying the caller)
  -- Practical approach: prevent any direct UPDATE that changes cash or margin
  IF current_setting('role') = 'authenticated' THEN
    NEW.cash_balance_sek := OLD.cash_balance_sek;
    NEW.margin_reserved_sek := OLD.margin_reserved_sek;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_balance_update ON public.competition_teams;
CREATE TRIGGER protect_balance_update
  BEFORE UPDATE ON public.competition_teams
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_competition_team_balance();
