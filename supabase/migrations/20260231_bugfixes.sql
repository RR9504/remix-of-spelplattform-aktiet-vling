-- ============================================================
-- Bugfix migration: Fix short/cover handling across the board
-- ============================================================

-- 1. Ensure realized_pnl_sek column exists on trades
--    (execute_cover references it, but it was originally added in a later migration)
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS realized_pnl_sek NUMERIC;

-- 2. Fix team_holdings VIEW to only count 'buy' and 'sell' trades
--    Previously: ELSE -shares (which incorrectly subtracted short/cover trades)
CREATE OR REPLACE VIEW public.team_holdings AS
SELECT
  t.team_id,
  t.competition_id,
  t.ticker,
  MAX(t.stock_name) AS stock_name,
  MAX(t.currency) AS currency,
  SUM(
    CASE
      WHEN t.side = 'buy' THEN t.shares
      WHEN t.side = 'sell' THEN -t.shares
      ELSE 0
    END
  ) AS total_shares,
  CASE
    WHEN SUM(CASE WHEN t.side = 'buy' THEN t.shares ELSE 0 END) > 0
    THEN SUM(CASE WHEN t.side = 'buy' THEN t.total_sek ELSE 0 END)
         / SUM(CASE WHEN t.side = 'buy' THEN t.shares ELSE 0 END)
    ELSE 0
  END AS avg_cost_per_share_sek
FROM public.trades t
GROUP BY t.team_id, t.competition_id, t.ticker
HAVING SUM(
  CASE
    WHEN t.side = 'buy' THEN t.shares
    WHEN t.side = 'sell' THEN -t.shares
    ELSE 0
  END
) > 0;

-- 3. Fix execute_trade function: sell validation should only count buy/sell trades
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
  SELECT * INTO _ct_row
  FROM public.competition_teams
  WHERE competition_id = _competition_id AND team_id = _team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Laget är inte med i denna tävling');
  END IF;

  IF _side = 'buy' THEN
    IF _ct_row.cash_balance_sek < _total_sek THEN
      RETURN jsonb_build_object('success', false, 'error', 'Otillräckligt saldo. Tillgängligt: ' || _ct_row.cash_balance_sek::TEXT || ' SEK');
    END IF;
    UPDATE public.competition_teams
    SET cash_balance_sek = cash_balance_sek - _total_sek
    WHERE id = _ct_row.id;
  ELSE
    -- Only count buy/sell trades, not short/cover
    SELECT COALESCE(SUM(
      CASE
        WHEN side = 'buy' THEN shares
        WHEN side = 'sell' THEN -shares
        ELSE 0
      END
    ), 0)
    INTO _current_shares
    FROM public.trades
    WHERE team_id = _team_id AND competition_id = _competition_id AND ticker = _ticker;

    IF _current_shares < _shares THEN
      RETURN jsonb_build_object('success', false, 'error', 'Otillräckligt antal aktier. Äger: ' || _current_shares::TEXT);
    END IF;
    UPDATE public.competition_teams
    SET cash_balance_sek = cash_balance_sek + _total_sek
    WHERE id = _ct_row.id;
  END IF;

  INSERT INTO public.trades (competition_id, team_id, executed_by, ticker, stock_name, side, shares, price_per_share, currency, exchange_rate, total_sek)
  VALUES (_competition_id, _team_id, _executed_by, _ticker, _stock_name, _side, _shares, _price_per_share, _currency, _exchange_rate, _total_sek)
  RETURNING id INTO _trade_id;

  RETURN jsonb_build_object(
    'success', true,
    'trade_id', _trade_id,
    'new_cash_balance', (SELECT cash_balance_sek FROM public.competition_teams WHERE id = _ct_row.id)
  );
END;
$$;

-- 4. Recreate execute_cover to ensure realized_pnl_sek column is available
CREATE OR REPLACE FUNCTION public.execute_cover(
  _competition_id UUID,
  _team_id UUID,
  _executed_by UUID,
  _ticker TEXT,
  _stock_name TEXT,
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
  _sp public.short_positions%ROWTYPE;
  _margin_to_release NUMERIC;
  _trade_id UUID;
  _pnl NUMERIC;
BEGIN
  SELECT * INTO _ct_row
  FROM public.competition_teams
  WHERE competition_id = _competition_id AND team_id = _team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Laget är inte med i denna tävling');
  END IF;

  SELECT * INTO _sp
  FROM public.short_positions
  WHERE competition_id = _competition_id AND team_id = _team_id AND ticker = _ticker AND closed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ingen öppen shortposition för ' || _ticker);
  END IF;

  IF _sp.shares < _shares THEN
    RETURN jsonb_build_object('success', false, 'error', 'Kan inte täcka fler aktier än blankade. Blankade: ' || _sp.shares::TEXT);
  END IF;

  _margin_to_release := (_sp.margin_reserved_sek * _shares) / _sp.shares;

  IF _ct_row.cash_balance_sek < _total_sek THEN
    RETURN jsonb_build_object('success', false, 'error', 'Otillräckligt saldo för att täcka. Behöver: ' || _total_sek::TEXT || ' SEK');
  END IF;

  _pnl := (_sp.entry_price_sek * _shares) - _total_sek;

  UPDATE public.competition_teams
  SET cash_balance_sek = cash_balance_sek - _total_sek,
      margin_reserved_sek = margin_reserved_sek - _margin_to_release
  WHERE id = _ct_row.id;

  INSERT INTO public.trades (competition_id, team_id, executed_by, ticker, stock_name, side, shares, price_per_share, currency, exchange_rate, total_sek, realized_pnl_sek)
  VALUES (_competition_id, _team_id, _executed_by, _ticker, _stock_name, 'cover', _shares, _price_per_share, _currency, _exchange_rate, _total_sek, ROUND(_pnl, 2))
  RETURNING id INTO _trade_id;

  IF _sp.shares = _shares THEN
    UPDATE public.short_positions
    SET shares = 0, closed_at = now(), margin_reserved_sek = 0
    WHERE id = _sp.id;
  ELSE
    UPDATE public.short_positions
    SET shares = shares - _shares,
        margin_reserved_sek = margin_reserved_sek - _margin_to_release
    WHERE id = _sp.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'trade_id', _trade_id,
    'realized_pnl', ROUND(_pnl, 2),
    'new_cash_balance', (SELECT cash_balance_sek FROM public.competition_teams WHERE id = _ct_row.id)
  );
END;
$$;

-- 5. Fix short_positions UNIQUE constraint to allow re-opening after close
--    Drop the old constraint and add a partial unique index (only for open positions)
ALTER TABLE public.short_positions DROP CONSTRAINT IF EXISTS short_positions_competition_id_team_id_ticker_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_short_positions_open_unique
  ON public.short_positions(competition_id, team_id, ticker)
  WHERE closed_at IS NULL;

-- 6. Update execute_short to work with partial unique index
CREATE OR REPLACE FUNCTION public.execute_short(
  _competition_id UUID,
  _team_id UUID,
  _executed_by UUID,
  _ticker TEXT,
  _stock_name TEXT,
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
  _margin NUMERIC;
  _trade_id UUID;
  _existing_sp public.short_positions%ROWTYPE;
BEGIN
  SELECT * INTO _ct_row
  FROM public.competition_teams
  WHERE competition_id = _competition_id AND team_id = _team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Laget är inte med i denna tävling');
  END IF;

  _margin := _total_sek * 1.5;

  IF (_ct_row.cash_balance_sek - _ct_row.margin_reserved_sek) < _margin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Otillräckligt saldo för marginal. Behöver: ' || _margin::TEXT || ' SEK');
  END IF;

  UPDATE public.competition_teams
  SET margin_reserved_sek = margin_reserved_sek + _margin,
      cash_balance_sek = cash_balance_sek + _total_sek
  WHERE id = _ct_row.id;

  INSERT INTO public.trades (competition_id, team_id, executed_by, ticker, stock_name, side, shares, price_per_share, currency, exchange_rate, total_sek)
  VALUES (_competition_id, _team_id, _executed_by, _ticker, _stock_name, 'short', _shares, _price_per_share, _currency, _exchange_rate, _total_sek)
  RETURNING id INTO _trade_id;

  -- Check if there's an existing open position
  SELECT * INTO _existing_sp
  FROM public.short_positions
  WHERE competition_id = _competition_id AND team_id = _team_id AND ticker = _ticker AND closed_at IS NULL
  FOR UPDATE;

  IF FOUND THEN
    -- Update existing open position
    UPDATE public.short_positions
    SET shares = _existing_sp.shares + _shares,
        entry_price_sek = (_existing_sp.entry_price_sek * _existing_sp.shares + _price_per_share * _exchange_rate * _shares) / (_existing_sp.shares + _shares),
        margin_reserved_sek = _existing_sp.margin_reserved_sek + _margin
    WHERE id = _existing_sp.id;
  ELSE
    -- Insert new position
    INSERT INTO public.short_positions (competition_id, team_id, ticker, stock_name, shares, entry_price_sek, margin_reserved_sek)
    VALUES (_competition_id, _team_id, _ticker, _stock_name, _shares, _price_per_share * _exchange_rate, _margin);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'trade_id', _trade_id,
    'new_cash_balance', (SELECT cash_balance_sek FROM public.competition_teams WHERE id = _ct_row.id)
  );
END;
$$;

-- 7. Add missing RLS policies for short_positions (service role bypasses, but add for completeness)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'short_positions' AND policyname = 'Service role can insert short_positions'
  ) THEN
    CREATE POLICY "Service role can insert short_positions"
      ON public.short_positions FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'short_positions' AND policyname = 'Service role can update short_positions'
  ) THEN
    CREATE POLICY "Service role can update short_positions"
      ON public.short_positions FOR UPDATE TO authenticated
      USING (true);
  END IF;
END $$;

-- 8. Add missing INSERT policy for season_scores (used by finalize-competition via service role)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'season_scores' AND policyname = 'Service role can insert season_scores'
  ) THEN
    CREATE POLICY "Service role can insert season_scores"
      ON public.season_scores FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;
END $$;
