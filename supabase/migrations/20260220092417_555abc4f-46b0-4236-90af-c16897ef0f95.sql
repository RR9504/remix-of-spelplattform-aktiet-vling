
-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Competitions table
CREATE TABLE public.competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  initial_balance NUMERIC NOT NULL DEFAULT 1000000,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

-- Teams table
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  captain_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  competition_id UUID REFERENCES public.competitions(id) ON DELETE SET NULL,
  invite_code TEXT NOT NULL DEFAULT substr(md5(random()::text), 1, 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Team members junction table
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, profile_id)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Helper functions (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_competition_creator(_competition_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.competitions WHERE id = _competition_id AND created_by = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_captain(_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teams WHERE id = _team_id AND captain_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_member(_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members WHERE team_id = _team_id AND profile_id = auth.uid()
  );
$$;

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- RLS Policies for competitions
CREATE POLICY "Authenticated can view competitions" ON public.competitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create competitions" ON public.competitions FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Creator can update competition" ON public.competitions FOR UPDATE TO authenticated USING (public.is_competition_creator(id));
CREATE POLICY "Creator can delete competition" ON public.competitions FOR DELETE TO authenticated USING (public.is_competition_creator(id));

-- RLS Policies for teams
CREATE POLICY "Authenticated can view teams" ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create teams" ON public.teams FOR INSERT TO authenticated WITH CHECK (captain_id = auth.uid());
CREATE POLICY "Captain can update team" ON public.teams FOR UPDATE TO authenticated USING (public.is_team_captain(id));
CREATE POLICY "Captain can delete team" ON public.teams FOR DELETE TO authenticated USING (public.is_team_captain(id));

-- RLS Policies for team_members
CREATE POLICY "Members can view team members" ON public.team_members FOR SELECT TO authenticated USING (public.is_team_member(team_id));
CREATE POLICY "Users can join teams" ON public.team_members FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Captain can remove members" ON public.team_members FOR DELETE TO authenticated USING (public.is_team_captain(team_id) OR profile_id = auth.uid());
