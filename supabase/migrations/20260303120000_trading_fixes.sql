-- =============================================
-- Trading fixes: margin check, fund reservation, share limits
-- =============================================

-- 1. Fix execute_trade: buy check must account for margin_reserved_sek
--    Also add max shares limit (100,000 per trade)
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
  _available_cash NUMERIC;
BEGIN
  -- Max shares limit
  IF _shares > 100000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Max 100 000 aktier per affär');
  END IF;

  SELECT * INTO _ct_row
  FROM public.competition_teams
  WHERE competition_id = _competition_id AND team_id = _team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Laget är inte med i denna tävling');
  END IF;

  IF _side = 'buy' THEN
    -- Available cash = total cash minus margin reserved for shorts
    _available_cash := _ct_row.cash_balance_sek - _ct_row.margin_reserved_sek;
    IF _available_cash < _total_sek THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Otillräckligt saldo. Tillgängligt: ' || ROUND(_available_cash, 2)::TEXT || ' SEK');
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
      RETURN jsonb_build_object('success', false, 'error',
        'Otillräckligt antal aktier. Äger: ' || _current_shares::TEXT);
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

-- 2. Add max shares limit to execute_short
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
  -- Max shares limit
  IF _shares > 100000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Max 100 000 aktier per affär');
  END IF;

  SELECT * INTO _ct_row
  FROM public.competition_teams
  WHERE competition_id = _competition_id AND team_id = _team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Laget är inte med i denna tävling');
  END IF;

  _margin := _total_sek * 1.5;

  IF (_ct_row.cash_balance_sek - _ct_row.margin_reserved_sek) < _margin THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Otillräckligt saldo för marginal. Behöver: ' || ROUND(_margin, 2)::TEXT || ' SEK');
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
    UPDATE public.short_positions
    SET shares = _existing_sp.shares + _shares,
        entry_price_sek = (_existing_sp.entry_price_sek * _existing_sp.shares + _price_per_share * _exchange_rate * _shares) / (_existing_sp.shares + _shares),
        margin_reserved_sek = _existing_sp.margin_reserved_sek + _margin
    WHERE id = _existing_sp.id;
  ELSE
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

-- 3. Add max shares limit to execute_cover
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
  -- Max shares limit
  IF _shares > 100000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Max 100 000 aktier per affär');
  END IF;

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
    RETURN jsonb_build_object('success', false, 'error',
      'Kan inte täcka fler aktier än blankade. Blankade: ' || _sp.shares::TEXT);
  END IF;

  _margin_to_release := (_sp.margin_reserved_sek * _shares) / _sp.shares;

  IF _ct_row.cash_balance_sek < _total_sek THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Otillräckligt saldo för att täcka. Behöver: ' || ROUND(_total_sek, 2)::TEXT || ' SEK');
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

-- 4. Add reserved_amount_sek column to pending_orders for limit_buy fund reservation
ALTER TABLE public.pending_orders ADD COLUMN IF NOT EXISTS reserved_amount_sek NUMERIC NOT NULL DEFAULT 0;

-- 5. Update fill_pending_order to handle reserved amounts
CREATE OR REPLACE FUNCTION public.fill_pending_order(
  _order_id UUID,
  _price_per_share NUMERIC,
  _currency TEXT,
  _exchange_rate NUMERIC,
  _stock_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order public.pending_orders%ROWTYPE;
  _total_sek NUMERIC;
  _trade_side public.trade_side;
  _trade_result JSONB;
BEGIN
  -- Get and validate order
  SELECT * INTO _order FROM public.pending_orders WHERE id = _order_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found or not pending');
  END IF;

  _total_sek := _order.shares * _price_per_share * _exchange_rate;

  -- Determine trade side
  IF _order.order_type = 'limit_buy' THEN
    _trade_side := 'buy';
    -- Release reserved funds back to cash before execute_trade deducts actual cost
    IF _order.reserved_amount_sek > 0 THEN
      UPDATE public.competition_teams
      SET cash_balance_sek = cash_balance_sek + _order.reserved_amount_sek
      WHERE competition_id = _order.competition_id AND team_id = _order.team_id;
    END IF;
  ELSE
    _trade_side := 'sell';
  END IF;

  -- Execute trade via existing function
  _trade_result := public.execute_trade(
    _order.competition_id,
    _order.team_id,
    _order.created_by,
    _order.ticker,
    COALESCE(_stock_name, _order.stock_name),
    _trade_side,
    _order.shares,
    _price_per_share,
    _currency,
    _exchange_rate,
    ROUND(_total_sek, 2)
  );

  IF (_trade_result->>'success')::boolean THEN
    UPDATE public.pending_orders
    SET status = 'filled',
        filled_at = now(),
        filled_trade_id = (_trade_result->>'trade_id')::UUID,
        reserved_amount_sek = 0
    WHERE id = _order_id;
  ELSE
    -- If fill failed, re-reserve the funds for limit_buy
    IF _order.order_type = 'limit_buy' AND _order.reserved_amount_sek > 0 THEN
      UPDATE public.competition_teams
      SET cash_balance_sek = cash_balance_sek - _order.reserved_amount_sek
      WHERE competition_id = _order.competition_id AND team_id = _order.team_id;
    END IF;
  END IF;

  RETURN _trade_result;
END;
$$;

-- 6. Function to release reserved funds (for cancel/expire)
CREATE OR REPLACE FUNCTION public.release_order_funds(
  _order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order public.pending_orders%ROWTYPE;
BEGIN
  SELECT * INTO _order FROM public.pending_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF _order.reserved_amount_sek > 0 THEN
    UPDATE public.competition_teams
    SET cash_balance_sek = cash_balance_sek + _order.reserved_amount_sek
    WHERE competition_id = _order.competition_id AND team_id = _order.team_id;

    UPDATE public.pending_orders
    SET reserved_amount_sek = 0
    WHERE id = _order_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
