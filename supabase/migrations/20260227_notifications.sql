-- ============================================================
-- Fas 3: Notifications
-- ============================================================

CREATE TYPE public.notification_type AS ENUM (
  'trade_executed',
  'order_filled',
  'order_expired',
  'margin_call',
  'forced_cover',
  'achievement_unlocked',
  'competition_started',
  'competition_ended',
  'team_joined'
);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_notifications_user_unread
  ON public.notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

-- RLS: users can read/update their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Enable Realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
