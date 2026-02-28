import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

interface TeamInfo {
  id: string;
  name: string;
  captain_id: string;
}

interface CompetitionInfo {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  initial_balance: number;
  is_public: boolean;
}

interface CompetitionContextType {
  teams: TeamInfo[];
  competitions: CompetitionInfo[];
  activeCompetition: CompetitionInfo | null;
  activeTeam: TeamInfo | null;
  setActiveCompetitionId: (id: string | null) => void;
  setActiveTeamId: (id: string | null) => void;
  cashBalance: number | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const CompetitionContext = createContext<CompetitionContextType>({
  teams: [],
  competitions: [],
  activeCompetition: null,
  activeTeam: null,
  setActiveCompetitionId: () => {},
  setActiveTeamId: () => {},
  cashBalance: null,
  loading: true,
  refresh: async () => {},
});

export const useCompetition = () => useContext(CompetitionContext);

const CACHE_KEY = "sa_competition_ctx";

function restoreCache(): {
  teams: TeamInfo[];
  competitions: CompetitionInfo[];
  activeCompetitionId: string | null;
  activeTeamId: string | null;
} | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.ts > 30 * 60 * 1000) return null; // 30 min TTL
    return cached.data;
  } catch {
    return null;
  }
}

function saveCache(data: {
  teams: TeamInfo[];
  competitions: CompetitionInfo[];
  activeCompetitionId: string | null;
  activeTeamId: string | null;
}) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export function CompetitionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // Restore from cache immediately — no loading spinner on return visits
  const cached = restoreCache();
  const [teams, setTeams] = useState<TeamInfo[]>(cached?.teams ?? []);
  const [competitions, setCompetitions] = useState<CompetitionInfo[]>(cached?.competitions ?? []);
  const [activeCompetitionId, setActiveCompetitionId] = useState<string | null>(cached?.activeCompetitionId ?? null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(cached?.activeTeamId ?? null);
  const [cashBalance, setCashBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(!cached);

  const refresh = useCallback(async () => {
    if (!user) {
      setTeams([]);
      setCompetitions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // Get user's teams
      const { data: memberRows } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("profile_id", user.id);

      const teamIds = (memberRows || []).map((r) => r.team_id);

      if (teamIds.length === 0) {
        setTeams([]);
        setCompetitions([]);
        return;
      }

      // Fetch teams and competition mappings in parallel
      const [{ data: teamData }, { data: ctRows }] = await Promise.all([
        supabase
          .from("teams")
          .select("id, name, captain_id")
          .in("id", teamIds),
        supabase
          .from("competition_teams")
          .select("competition_id")
          .in("team_id", teamIds),
      ]);

      const userTeams = (teamData as unknown as TeamInfo[]) || [];
      setTeams(userTeams);

      const compIds = [...new Set((ctRows || []).map((r: any) => r.competition_id))];

      if (compIds.length > 0) {
        const { data: compData } = await supabase
          .from("competitions")
          .select("id, name, start_date, end_date, initial_balance, is_public")
          .in("id", compIds);

        const comps = (compData as unknown as CompetitionInfo[]) || [];
        setCompetitions(comps);

        // Auto-select first competition and team if not set
        if (!activeCompetitionId && comps.length > 0) {
          setActiveCompetitionId(comps[0].id);
        }
      } else {
        setCompetitions([]);
      }

      if (!activeTeamId && userTeams.length > 0) {
        setActiveTeamId(userTeams[0].id);
      }
    } catch (err) {
      console.error("CompetitionContext refresh failed:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch cash balance when active competition/team change
  useEffect(() => {
    if (!activeCompetitionId || !activeTeamId) {
      setCashBalance(null);
      return;
    }
    supabase
      .from("competition_teams")
      .select("cash_balance_sek")
      .eq("competition_id", activeCompetitionId)
      .eq("team_id", activeTeamId)
      .single()
      .then(({ data }) => {
        setCashBalance(data ? Number((data as any).cash_balance_sek) : null);
      });
  }, [activeCompetitionId, activeTeamId]);

  useEffect(() => {
    refresh();
  }, [user]);

  // Persist context to localStorage whenever it changes
  useEffect(() => {
    if (teams.length > 0 || competitions.length > 0) {
      saveCache({ teams, competitions, activeCompetitionId, activeTeamId });
    }
  }, [teams, competitions, activeCompetitionId, activeTeamId]);

  const activeCompetition = competitions.find((c) => c.id === activeCompetitionId) || null;
  const activeTeam = teams.find((t) => t.id === activeTeamId) || null;

  return (
    <CompetitionContext.Provider
      value={{
        teams,
        competitions,
        activeCompetition,
        activeTeam,
        setActiveCompetitionId,
        setActiveTeamId,
        cashBalance,
        loading,
        refresh,
      }}
    >
      {children}
    </CompetitionContext.Provider>
  );
}
