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
  teamsForActiveCompetition: TeamInfo[];
  competitions: CompetitionInfo[];
  allCompetitions: CompetitionInfo[];
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
  teamsForActiveCompetition: [],
  competitions: [],
  allCompetitions: [],
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

interface CacheData {
  teams: TeamInfo[];
  competitions: CompetitionInfo[];
  competitionTeamMap: Record<string, string[]>;
  activeCompetitionId: string | null;
  activeTeamId: string | null;
}

function restoreCache(): CacheData | null {
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

function saveCache(data: CacheData) {
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
  const [competitionTeamMap, setCompetitionTeamMap] = useState<Record<string, string[]>>(cached?.competitionTeamMap ?? {});
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
          .select("competition_id, team_id")
          .in("team_id", teamIds),
      ]);

      const userTeams = (teamData as unknown as TeamInfo[]) || [];
      setTeams(userTeams);

      // Build competition -> team_ids mapping
      const ctMap: Record<string, string[]> = {};
      for (const row of (ctRows || []) as any[]) {
        if (!ctMap[row.competition_id]) ctMap[row.competition_id] = [];
        ctMap[row.competition_id].push(row.team_id);
      }
      setCompetitionTeamMap(ctMap);

      const compIds = [...new Set((ctRows || []).map((r: any) => r.competition_id))];

      if (compIds.length > 0) {
        const { data: compData } = await supabase
          .from("competitions")
          .select("id, name, start_date, end_date, initial_balance, is_public")
          .in("id", compIds);

        const comps = (compData as unknown as CompetitionInfo[]) || [];
        setCompetitions(comps);

        // Auto-select first active/upcoming competition (skip ended)
        const today = new Date().toISOString().split("T")[0];
        const activeComps = comps.filter((c) => c.end_date >= today);
        if (!activeCompetitionId && activeComps.length > 0) {
          setActiveCompetitionId(activeComps[0].id);
        } else if (activeCompetitionId && comps.length > 0) {
          // If currently selected competition has ended, switch to next active
          const current = comps.find((c) => c.id === activeCompetitionId);
          if (current && current.end_date < today && activeComps.length > 0) {
            setActiveCompetitionId(activeComps[0].id);
          }
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
      saveCache({ teams, competitions, competitionTeamMap, activeCompetitionId, activeTeamId });
    }
  }, [teams, competitions, competitionTeamMap, activeCompetitionId, activeTeamId]);

  const activeTeam = teams.find((t) => t.id === activeTeamId) || null;

  // Filter out ended competitions for dashboard selector
  const today = new Date().toISOString().split("T")[0];
  const activeCompetitions = competitions.filter((c) => c.end_date >= today);

  // activeCompetition must be an active/upcoming competition — never an ended one
  const activeCompetition = activeCompetitions.find((c) => c.id === activeCompetitionId) || null;

  // Teams that are actually in the active competition
  const teamsForActiveCompetition = activeCompetitionId
    ? teams.filter((t) => (competitionTeamMap[activeCompetitionId] || []).includes(t.id))
    : [];

  // If activeCompetitionId is stale (ended, deleted, or not in user's competitions), auto-switch
  useEffect(() => {
    if (competitions.length === 0) return;
    if (!activeCompetitionId) {
      // No competition selected — pick first active one
      if (activeCompetitions.length > 0) {
        setActiveCompetitionId(activeCompetitions[0].id);
      }
      return;
    }
    // Check if selected competition is still valid and active
    const isActive = activeCompetitions.some((c) => c.id === activeCompetitionId);
    if (!isActive) {
      if (activeCompetitions.length > 0) {
        setActiveCompetitionId(activeCompetitions[0].id);
      } else {
        setActiveCompetitionId(null);
      }
    }
  }, [activeCompetitionId, competitions]);

  // Auto-select a team that's actually in the active competition
  useEffect(() => {
    if (!activeCompetitionId) return;
    const validTeamIds = competitionTeamMap[activeCompetitionId] || [];
    if (validTeamIds.length === 0) {
      // No teams in this competition — check if activeTeamId is at least a valid team
      if (activeTeamId && !teams.some((t) => t.id === activeTeamId) && teams.length > 0) {
        setActiveTeamId(teams[0].id);
      }
      return;
    }
    if (activeTeamId && validTeamIds.includes(activeTeamId)) return;
    // Current team is not in this competition — switch to first valid team
    setActiveTeamId(validTeamIds[0]);
  }, [activeCompetitionId, competitionTeamMap, teams]);

  return (
    <CompetitionContext.Provider
      value={{
        teams,
        teamsForActiveCompetition,
        competitions: activeCompetitions,
        allCompetitions: competitions,
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
