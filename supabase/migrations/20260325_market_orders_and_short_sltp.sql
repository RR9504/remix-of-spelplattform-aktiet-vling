-- ============================================================
-- Market orders (closed-market queuing) + SL/TP for shorts
-- ============================================================

-- 1. Expand order_type enum with market order types
ALTER TYPE public.order_type ADD VALUE IF NOT EXISTS 'market_buy';
ALTER TYPE public.order_type ADD VALUE IF NOT EXISTS 'market_sell';
ALTER TYPE public.order_type ADD VALUE IF NOT EXISTS 'market_short';
ALTER TYPE public.order_type ADD VALUE IF NOT EXISTS 'market_cover';

-- 2. Add for_short flag to pending_orders (SL/TP on shorts trigger cover, not sell)
ALTER TABLE public.pending_orders ADD COLUMN IF NOT EXISTS for_short BOOLEAN NOT NULL DEFAULT false;

-- 3. Make target_price nullable (market orders have no target price)
ALTER TABLE public.pending_orders ALTER COLUMN target_price DROP NOT NULL;
ALTER TABLE public.pending_orders DROP CONSTRAINT IF EXISTS pending_orders_target_price_check;
ALTER TABLE public.pending_orders ADD CONSTRAINT pending_orders_target_price_check
  CHECK (target_price IS NULL OR target_price > 0);

-- 4. Update fill_pending_order to handle market orders, short SL/TP
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
  _trade_result JSONB;
BEGIN
  -- Get and validate order
  SELECT * INTO _order FROM public.pending_orders WHERE id = _order_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found or not pending');
  END IF;

  _total_sek := _order.shares * _price_per_share * _exchange_rate;

  -- Determine execution path based on order type and for_short flag
  IF _order.order_type IN ('market_short', 'market_cover') OR
     (_order.for_short AND _order.order_type IN ('stop_loss', 'take_profit')) THEN
    -- Short-related orders: use execute_short or execute_cover
    IF _order.order_type = 'market_short' THEN
      _trade_result := public.execute_short(
        _order.competition_id,
        _order.team_id,
        _order.created_by,
        _order.ticker,
        COALESCE(_stock_name, _order.stock_name),
        _order.shares,
        _price_per_share,
        _currency,
        _exchange_rate,
        ROUND(_total_sek, 2)
      );
    ELSE
      -- market_cover, or SL/TP for short → execute cover
      _trade_result := public.execute_cover(
        _order.competition_id,
        _order.team_id,
        _order.created_by,
        _order.ticker,
        COALESCE(_stock_name, _order.stock_name),
        _order.shares,
        _price_per_share,
        _currency,
        _exchange_rate,
        ROUND(_total_sek, 2)
      );
    END IF;
  ELSE
    -- Regular orders: limit_buy, limit_sell, market_buy, market_sell, SL/TP for longs
    IF _order.order_type IN ('limit_buy', 'market_buy') THEN
      -- Release reserved funds before execute_trade deducts actual cost
      IF _order.reserved_amount_sek > 0 THEN
        UPDATE public.competition_teams
        SET cash_balance_sek = cash_balance_sek + _order.reserved_amount_sek
        WHERE competition_id = _order.competition_id AND team_id = _order.team_id;
      END IF;

      _trade_result := public.execute_trade(
        _order.competition_id,
        _order.team_id,
        _order.created_by,
        _order.ticker,
        COALESCE(_stock_name, _order.stock_name),
        'buy',
        _order.shares,
        _price_per_share,
        _currency,
        _exchange_rate,
        ROUND(_total_sek, 2)
      );

      -- If fill failed, re-reserve the funds
      IF NOT (_trade_result->>'success')::boolean AND _order.reserved_amount_sek > 0 THEN
        UPDATE public.competition_teams
        SET cash_balance_sek = cash_balance_sek - _order.reserved_amount_sek
        WHERE competition_id = _order.competition_id AND team_id = _order.team_id;
      END IF;
    ELSE
      -- limit_sell, market_sell, stop_loss, take_profit (for longs)
      _trade_result := public.execute_trade(
        _order.competition_id,
        _order.team_id,
        _order.created_by,
        _order.ticker,
        COALESCE(_stock_name, _order.stock_name),
        'sell',
        _order.shares,
        _price_per_share,
        _currency,
        _exchange_rate,
        ROUND(_total_sek, 2)
      );
    END IF;
  END IF;

  IF (_trade_result->>'success')::boolean THEN
    UPDATE public.pending_orders
    SET status = 'filled',
        filled_at = now(),
        filled_trade_id = (_trade_result->>'trade_id')::UUID,
        reserved_amount_sek = 0
    WHERE id = _order_id;
  END IF;

  RETURN _trade_result;
END;
$$;
