-- ============================================================
-- Fas 4: Competition Chat
-- ============================================================

CREATE TABLE public.competition_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.competition_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_competition_messages_comp_date
  ON public.competition_messages(competition_id, created_at DESC);

-- Helper function to check competition membership
CREATE OR REPLACE FUNCTION public.is_competition_member(_competition_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.competition_teams ct
    JOIN public.team_members tm ON tm.team_id = ct.team_id
    WHERE ct.competition_id = _competition_id
      AND tm.profile_id = auth.uid()
  );
END;
$$;

-- RLS: competition members can read + write
CREATE POLICY "Competition members can view messages"
  ON public.competition_messages FOR SELECT TO authenticated
  USING (public.is_competition_member(competition_id));

CREATE POLICY "Competition members can send messages"
  ON public.competition_messages FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    AND public.is_competition_member(competition_id)
  );

-- Enable Realtime
ALTER TABLE public.competition_messages REPLICA IDENTITY FULL;
