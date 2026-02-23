-- ============================================================
-- Fas 1: Trading schema migration
-- ============================================================

-- 1a. Extend competitions table
ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS max_teams INTEGER;

-- 1b. New table: competition_teams (many-to-many with cash balance)
CREATE TABLE public.competition_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  cash_balance_sek NUMERIC NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(competition_id, team_id)
);
ALTER TABLE public.competition_teams ENABLE ROW LEVEL SECURITY;

-- 1c. New table: trades
CREATE TYPE public.trade_side AS ENUM ('buy', 'sell');

CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  executed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  side public.trade_side NOT NULL,
  shares INTEGER NOT NULL CHECK (shares > 0),
  price_per_share NUMERIC NOT NULL CHECK (price_per_share > 0),
  currency TEXT NOT NULL DEFAULT 'SEK',
  exchange_rate NUMERIC NOT NULL DEFAULT 1,
  total_sek NUMERIC NOT NULL CHECK (total_sek > 0),
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_trades_team_competition ON public.trades(team_id, competition_id);
CREATE INDEX idx_trades_team_competition_ticker ON public.trades(team_id, competition_id, ticker);

-- 1d. View: team_holdings (aggregated trades per team+ticker)
CREATE OR REPLACE VIEW public.team_holdings AS
SELECT
  t.team_id,
  t.competition_id,
  t.ticker,
  MAX(t.stock_name) AS stock_name,
  MAX(t.currency) AS currency,
  SUM(CASE WHEN t.side = 'buy' THEN t.shares ELSE -t.shares END) AS total_shares,
  -- Weighted average cost per share in SEK (only buy trades)
  CASE
    WHEN SUM(CASE WHEN t.side = 'buy' THEN t.shares ELSE 0 END) > 0
    THEN SUM(CASE WHEN t.side = 'buy' THEN t.total_sek ELSE 0 END)
         / SUM(CASE WHEN t.side = 'buy' THEN t.shares ELSE 0 END)
    ELSE 0
  END AS avg_cost_per_share_sek
FROM public.trades t
GROUP BY t.team_id, t.competition_id, t.ticker
HAVING SUM(CASE WHEN t.side = 'buy' THEN t.shares ELSE -t.shares END) > 0;

-- 1e. New table: portfolio_snapshots
CREATE TABLE public.portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_value_sek NUMERIC NOT NULL,
  cash_sek NUMERIC NOT NULL,
  holdings_value_sek NUMERIC NOT NULL,
  UNIQUE(competition_id, team_id, snapshot_date)
);
ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- 1f. New table: stock_price_cache
CREATE TABLE public.stock_price_cache (
  ticker TEXT PRIMARY KEY,
  price NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SEK',
  exchange_rate NUMERIC NOT NULL DEFAULT 1,
  price_sek NUMERIC NOT NULL,
  stock_name TEXT,
  exchange TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stock_price_cache ENABLE ROW LEVEL SECURITY;

-- 1g. Database function: execute_trade(...)
CREATE OR REPLACE FUNCTION public.execute_trade(
  _competition_id UUID,
  _team_id UUID,
  _executed_by UUID,
  _ticker TEXT,
  _stock_name TEXT,
  _side public.trade_side,
  _shares INTEGER,
  _price_per_share NUMERIC,
  _currency TEXT,
  _exchange_rate NUMERIC,
  _total_sek NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ct_row public.competition_teams%ROWTYPE;
  _current_shares INTEGER;
  _trade_id UUID;
BEGIN
  -- Lock the competition_teams row to prevent race conditions
  SELECT * INTO _ct_row
  FROM public.competition_teams
  WHERE competition_id = _competition_id AND team_id = _team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Laget är inte med i denna tävling');
  END IF;

  IF _side = 'buy' THEN
    -- Validate cash is sufficient
    IF _ct_row.cash_balance_sek < _total_sek THEN
      RETURN jsonb_build_object('success', false, 'error', 'Otillräckligt saldo. Tillgängligt: ' || _ct_row.cash_balance_sek::TEXT || ' SEK');
    END IF;
    -- Deduct cash
    UPDATE public.competition_teams
    SET cash_balance_sek = cash_balance_sek - _total_sek
    WHERE id = _ct_row.id;
  ELSE
    -- Validate team owns enough shares
    SELECT COALESCE(SUM(CASE WHEN side = 'buy' THEN shares ELSE -shares END), 0)
    INTO _current_shares
    FROM public.trades
    WHERE team_id = _team_id AND competition_id = _competition_id AND ticker = _ticker;

    IF _current_shares < _shares THEN
      RETURN jsonb_build_object('success', false, 'error', 'Otillräckligt antal aktier. Äger: ' || _current_shares::TEXT);
    END IF;
    -- Add cash
    UPDATE public.competition_teams
    SET cash_balance_sek = cash_balance_sek + _total_sek
    WHERE id = _ct_row.id;
  END IF;

  -- Insert trade
  INSERT INTO public.trades (competition_id, team_id, executed_by, ticker, stock_name, side, shares, price_per_share, currency, exchange_rate, total_sek)
  VALUES (_competition_id, _team_id, _executed_by, _ticker, _stock_name, _side, _shares, _price_per_share, _currency, _exchange_rate, _total_sek)
  RETURNING id INTO _trade_id;

  -- Return result with new cash balance
  RETURN jsonb_build_object(
    'success', true,
    'trade_id', _trade_id,
    'new_cash_balance', (SELECT cash_balance_sek FROM public.competition_teams WHERE id = _ct_row.id)
  );
END;
$$;

-- 1h. RLS Policies

-- competition_teams: all authenticated can read, captain can join their team
CREATE POLICY "Authenticated can view competition_teams"
  ON public.competition_teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "Team captain can join competition"
  ON public.competition_teams FOR INSERT TO authenticated
  WITH CHECK (public.is_team_captain(team_id));
CREATE POLICY "Team captain can update competition_teams"
  ON public.competition_teams FOR UPDATE TO authenticated
  USING (public.is_team_captain(team_id));

-- trades: team members can read, inserts via service role / execute_trade function
CREATE POLICY "Team members can view trades"
  ON public.trades FOR SELECT TO authenticated
  USING (public.is_team_member(team_id));
CREATE POLICY "All authenticated can view trades in competition"
  ON public.trades FOR SELECT TO authenticated USING (true);

-- portfolio_snapshots: all authenticated can read
CREATE POLICY "Authenticated can view snapshots"
  ON public.portfolio_snapshots FOR SELECT TO authenticated USING (true);

-- stock_price_cache: all authenticated can read
CREATE POLICY "Authenticated can view stock_price_cache"
  ON public.stock_price_cache FOR SELECT TO authenticated USING (true);
