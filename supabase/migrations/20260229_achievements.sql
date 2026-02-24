-- ============================================================
-- Fas 5: Achievements / Badges
-- ============================================================

CREATE TABLE public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🏆',
  criteria JSONB NOT NULL DEFAULT '{}'
);
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  competition_id UUID REFERENCES public.competitions(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, achievement_id, competition_id)
);
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- RLS: all authenticated can read
CREATE POLICY "Authenticated can view achievements"
  ON public.achievements FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can view user_achievements"
  ON public.user_achievements FOR SELECT TO authenticated USING (true);

-- Seed achievements
INSERT INTO public.achievements (key, name, description, icon, criteria) VALUES
  ('first_trade', 'Första affären', 'Genomför din första trade', '🎯', '{"min_trades": 1}'),
  ('ten_trades', 'Aktiv handlare', 'Genomför 10 trades', '📊', '{"min_trades": 10}'),
  ('fifty_trades', 'Daytrader', 'Genomför 50 trades', '⚡', '{"min_trades": 50}'),
  ('doubled_capital', 'Dubblat kapitalet', 'Uppnå 100% avkastning', '💎', '{"min_return_percent": 100}'),
  ('ten_percent_return', 'Tio procent', 'Uppnå 10% avkastning', '📈', '{"min_return_percent": 10}'),
  ('diversified', 'Diversifierad', 'Äg 5 eller fler unika aktier', '🌍', '{"min_holdings": 5}'),
  ('bought_the_dip', 'Köpte i dippen', 'Köp en aktie som fallit mer än 5%', '🔥', '{"buy_dip_percent": 5}'),
  ('first_short', 'Första blankningen', 'Genomför din första blankning', '🐻', '{"min_shorts": 1}'),
  ('competition_winner', 'Vinnaren', 'Vinn en tävling', '👑', '{"win": true}')
ON CONFLICT (key) DO NOTHING;
