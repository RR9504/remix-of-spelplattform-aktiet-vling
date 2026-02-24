-- ============================================================
-- Fas 2: Short Selling
-- ============================================================

-- 2a. Extend trade_side ENUM with 'short' and 'cover'
ALTER TYPE public.trade_side ADD VALUE IF NOT EXISTS 'short';
ALTER TYPE public.trade_side ADD VALUE IF NOT EXISTS 'cover';

-- 2b. Add margin_reserved_sek to competition_teams
ALTER TABLE public.competition_teams
  ADD COLUMN IF NOT EXISTS margin_reserved_sek NUMERIC NOT NULL DEFAULT 0;

-- 2c. Short positions table
CREATE TABLE public.short_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  shares INTEGER NOT NULL CHECK (shares > 0),
  entry_price_sek NUMERIC NOT NULL,
  margin_reserved_sek NUMERIC NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  UNIQUE(competition_id, team_id, ticker)
);
ALTER TABLE public.short_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view short_positions"
  ON public.short_positions FOR SELECT TO authenticated USING (true);

-- 2d. DB function: execute_short
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
BEGIN
  -- Lock competition_teams row
  SELECT * INTO _ct_row
  FROM public.competition_teams
  WHERE competition_id = _competition_id AND team_id = _team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Laget är inte med i denna tävling');
  END IF;

  -- Calculate margin (150% of short value)
  _margin := _total_sek * 1.5;

  -- Check available cash (cash - already reserved margin)
  IF (_ct_row.cash_balance_sek - _ct_row.margin_reserved_sek) < _margin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Otillräckligt saldo för marginal. Behöver: ' || _margin::TEXT || ' SEK');
  END IF;

  -- Reserve margin and add short proceeds to cash
  UPDATE public.competition_teams
  SET margin_reserved_sek = margin_reserved_sek + _margin,
      cash_balance_sek = cash_balance_sek + _total_sek
  WHERE id = _ct_row.id;

  -- Insert trade
  INSERT INTO public.trades (competition_id, team_id, executed_by, ticker, stock_name, side, shares, price_per_share, currency, exchange_rate, total_sek)
  VALUES (_competition_id, _team_id, _executed_by, _ticker, _stock_name, 'short', _shares, _price_per_share, _currency, _exchange_rate, _total_sek)
  RETURNING id INTO _trade_id;

  -- Upsert short position
  INSERT INTO public.short_positions (competition_id, team_id, ticker, stock_name, shares, entry_price_sek, margin_reserved_sek)
  VALUES (_competition_id, _team_id, _ticker, _stock_name, _shares, _price_per_share * _exchange_rate, _margin)
  ON CONFLICT (competition_id, team_id, ticker) DO UPDATE
  SET shares = short_positions.shares + _shares,
      entry_price_sek = (short_positions.entry_price_sek * short_positions.shares + _price_per_share * _exchange_rate * _shares) / (short_positions.shares + _shares),
      margin_reserved_sek = short_positions.margin_reserved_sek + _margin,
      closed_at = NULL;

  RETURN jsonb_build_object(
    'success', true,
    'trade_id', _trade_id,
    'new_cash_balance', (SELECT cash_balance_sek FROM public.competition_teams WHERE id = _ct_row.id)
  );
END;
$$;

-- 2e. DB function: execute_cover
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
  -- Lock competition_teams row
  SELECT * INTO _ct_row
  FROM public.competition_teams
  WHERE competition_id = _competition_id AND team_id = _team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Laget är inte med i denna tävling');
  END IF;

  -- Get short position
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

  -- Calculate margin to release (proportional)
  _margin_to_release := (_sp.margin_reserved_sek * _shares) / _sp.shares;

  -- Check cash is sufficient to buy back
  IF _ct_row.cash_balance_sek < _total_sek THEN
    RETURN jsonb_build_object('success', false, 'error', 'Otillräckligt saldo för att täcka. Behöver: ' || _total_sek::TEXT || ' SEK');
  END IF;

  -- P&L: entry_value - cover_cost (profit when price drops)
  _pnl := (_sp.entry_price_sek * _shares) - _total_sek;

  -- Deduct cash and release margin
  UPDATE public.competition_teams
  SET cash_balance_sek = cash_balance_sek - _total_sek,
      margin_reserved_sek = margin_reserved_sek - _margin_to_release
  WHERE id = _ct_row.id;

  -- Insert trade with realized P&L
  INSERT INTO public.trades (competition_id, team_id, executed_by, ticker, stock_name, side, shares, price_per_share, currency, exchange_rate, total_sek, realized_pnl_sek)
  VALUES (_competition_id, _team_id, _executed_by, _ticker, _stock_name, 'cover', _shares, _price_per_share, _currency, _exchange_rate, _total_sek, ROUND(_pnl, 2))
  RETURNING id INTO _trade_id;

  -- Update or close short position
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

-- 2f. DB function: check_margin_calls
CREATE OR REPLACE FUNCTION public.check_margin_call(
  _position_id UUID,
  _current_price_sek NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sp public.short_positions%ROWTYPE;
  _current_value NUMERIC;
  _min_margin NUMERIC;
BEGIN
  SELECT * INTO _sp FROM public.short_positions WHERE id = _position_id AND closed_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('margin_call', false);
  END IF;

  _current_value := _sp.shares * _current_price_sek;
  _min_margin := _current_value * 1.2; -- 120% margin requirement

  IF _sp.margin_reserved_sek < _min_margin THEN
    RETURN jsonb_build_object('margin_call', true, 'position_id', _position_id, 'ticker', _sp.ticker, 'deficit', _min_margin - _sp.margin_reserved_sek);
  END IF;

  RETURN jsonb_build_object('margin_call', false);
END;
$$;
