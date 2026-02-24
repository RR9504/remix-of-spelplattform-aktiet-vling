-- ============================================================
-- Fas 1: Pending Orders (Limit, Stop-Loss, Take-Profit)
-- ============================================================

-- 1a. New ENUMs
CREATE TYPE public.order_type AS ENUM ('limit_buy', 'limit_sell', 'stop_loss', 'take_profit');
CREATE TYPE public.order_status AS ENUM ('pending', 'filled', 'cancelled', 'expired');

-- 1b. New table: pending_orders
CREATE TABLE public.pending_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  order_type public.order_type NOT NULL,
  target_price NUMERIC NOT NULL CHECK (target_price > 0),
  shares INTEGER NOT NULL CHECK (shares > 0),
  currency TEXT NOT NULL DEFAULT 'SEK',
  status public.order_status NOT NULL DEFAULT 'pending',
  reference_avg_cost_sek NUMERIC,
  filled_at TIMESTAMPTZ,
  filled_trade_id UUID REFERENCES public.trades(id),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE public.pending_orders ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_pending_orders_status ON public.pending_orders(status) WHERE status = 'pending';
CREATE INDEX idx_pending_orders_team_comp ON public.pending_orders(team_id, competition_id);

-- 1c. DB function: fill_pending_order
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
        filled_trade_id = (_trade_result->>'trade_id')::UUID
    WHERE id = _order_id;
  END IF;

  RETURN _trade_result;
END;
$$;

-- 1d. RLS Policies
CREATE POLICY "Authenticated can view pending_orders"
  ON public.pending_orders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can insert pending_orders"
  ON public.pending_orders FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Service role can update pending_orders"
  ON public.pending_orders FOR UPDATE TO authenticated
  USING (created_by = auth.uid());
