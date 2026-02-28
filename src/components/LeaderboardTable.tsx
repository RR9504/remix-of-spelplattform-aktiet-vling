import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Trophy, Loader2 } from "lucide-react";
import { formatSEK } from "@/lib/mockData";
import { getLeaderboard } from "@/lib/api";
import { useCompetition } from "@/contexts/CompetitionContext";
import type { LeaderboardEntry } from "@/types/trading";

export function LeaderboardTable() {
  const { activeCompetition, activeTeam } = useCompetition();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchData = async () => {
    if (!activeCompetition) {
      setEntries([]);
      setLoading(false);
      return;
    }
    const data = await getLeaderboard(activeCompetition.id);
    if (data) {
      setEntries(data.leaderboard);
    }
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    fetchData();

    // Auto-refresh every 60 seconds
    intervalRef.current = setInterval(fetchData, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeCompetition?.id]);

  if (!activeCompetition) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Gå med i en tävling för att se topplistan.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Inga lag har gått med i tävlingen ännu.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((team, i) => {
        const isPositive = team.return_percent >= 0;
        const rank = team.rank;
        const isOwnTeam = team.team_id === activeTeam?.id;

        return (
          <div
            key={team.team_id}
            className={`flex items-center gap-3 sm:gap-4 rounded-xl border bg-card p-3 sm:p-4 transition-all hover:bg-muted ${
              rank <= 3 ? "glow-primary border-primary/20" : ""
            } ${isOwnTeam ? "ring-2 ring-primary/50" : ""}`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface font-mono font-bold text-lg">
              {rank <= 3 ? (
                <Trophy
                  className={`h-5 w-5 ${
                    rank === 1 ? "text-yellow-400" : rank === 2 ? "text-gray-400" : "text-amber-600"
                  }`}
                />
              ) : (
                <span className="text-muted-foreground">{rank}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">
                <Link to={`/team/${team.team_id}/profile`} className="hover:text-primary hover:underline">
                  {team.team_name}
                </Link>
                {isOwnTeam && <span className="ml-2 text-xs text-primary">(ditt lag)</span>}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{team.members.join(", ")}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold">{formatSEK(team.total_value)}</p>
              <p
                className={`font-mono text-xs font-medium ${isPositive ? "text-gain" : "text-loss"}`}
              >
                {isPositive ? "+" : ""}
                {team.return_percent.toFixed(2)}%
              </p>
              <p
                className={`font-mono text-xs font-medium ${isPositive ? "text-gain" : "text-loss"}`}
              >
                {isPositive ? "+" : ""}
                {formatSEK(team.return_amount)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
