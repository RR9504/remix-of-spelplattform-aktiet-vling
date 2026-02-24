import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Trophy, Loader2 } from "lucide-react";
import { getSeasonRanking } from "@/lib/api";
import type { SeasonRankingEntry } from "@/types/trading";

export function SeasonRanking() {
  const [ranking, setRanking] = useState<SeasonRankingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSeasonRanking().then((data) => {
      setRanking(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (ranking.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Ingen säsongsranking ännu. Avsluta en tävling för att se resultaten.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {ranking.map((entry, i) => {
        const rank = i + 1;
        return (
          <div
            key={entry.team_id}
            className={`flex items-center gap-4 rounded-xl border bg-card p-4 transition-all hover:bg-muted ${
              rank <= 3 ? "glow-primary border-primary/20" : ""
            }`}
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
                <Link to={`/team/${entry.team_id}/profile`} className="hover:text-primary hover:underline">
                  {entry.team_name}
                </Link>
              </p>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>{entry.competitions} tävlingar</span>
                <span>{entry.wins} segrar</span>
                <span>{entry.podiums} podier</span>
                <span>Snittplats: {entry.avg_rank}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-lg font-bold text-primary">{entry.total_points}p</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
