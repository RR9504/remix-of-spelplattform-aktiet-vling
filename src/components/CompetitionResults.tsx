import { useEffect, useState } from "react";
import { Trophy, Loader2 } from "lucide-react";
import { formatSEK } from "@/lib/mockData";
import { getCompetitionResults, type CompetitionResult } from "@/lib/api";
import { useCompetition } from "@/contexts/CompetitionContext";
import { Badge } from "@/components/ui/badge";

interface CompetitionResultsProps {
  competitionId: string;
  competitionName: string;
  startDate: string;
  endDate: string;
  initialBalance: number;
}

const TROPHY_COLORS = [
  "text-yellow-400",  // gold
  "text-gray-400",    // silver
  "text-amber-600",   // bronze
];

export function CompetitionResults({
  competitionId,
  competitionName,
  startDate,
  endDate,
  initialBalance,
}: CompetitionResultsProps) {
  const { teams } = useCompetition();
  const [results, setResults] = useState<CompetitionResult[]>([]);
  const [loading, setLoading] = useState(true);

  const myTeamIds = new Set(teams.map((t) => t.id));

  useEffect(() => {
    setLoading(true);
    getCompetitionResults(competitionId).then((data) => {
      setResults(data);
      setLoading(false);
    });
  }, [competitionId]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Inga resultat tillgängliga.</p>
      </div>
    );
  }

  const podium = results.slice(0, 3);
  const myResult = results.find((r) => myTeamIds.has(r.team_id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <h3 className="text-lg font-bold">{competitionName}</h3>
        <p className="text-sm text-muted-foreground">
          {startDate} – {endDate} · Startkapital: {formatSEK(initialBalance)}
        </p>
      </div>

      {/* Podium */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 0, 2].map((podiumIdx) => {
          const entry = podium[podiumIdx];
          if (!entry) return <div key={podiumIdx} />;
          const isOwn = myTeamIds.has(entry.team_id);
          const isPositive = entry.final_return_percent >= 0;
          return (
            <div
              key={entry.team_id}
              className={`flex flex-col items-center rounded-xl border p-3 sm:p-4 ${
                podiumIdx === 0 ? "bg-yellow-500/5 border-yellow-500/30" : "bg-card"
              } ${isOwn ? "ring-2 ring-primary/50" : ""}`}
            >
              <Trophy className={`h-6 w-6 sm:h-8 sm:w-8 mb-2 ${TROPHY_COLORS[entry.final_rank - 1]}`} />
              <p className="font-bold text-xs sm:text-sm text-center truncate w-full">
                {entry.team_name}
              </p>
              <p className={`font-mono text-xs sm:text-sm font-semibold mt-1 ${isPositive ? "text-gain" : "text-loss"}`}>
                {isPositive ? "+" : ""}{entry.final_return_percent.toFixed(1)}%
              </p>
              <p className="font-mono text-[10px] sm:text-xs text-muted-foreground">
                {formatSEK(entry.final_value)}
              </p>
              <Badge variant="outline" className="mt-2 text-[10px]">
                {entry.points} poäng
              </Badge>
            </div>
          );
        })}
      </div>

      {/* My team summary */}
      {myResult && myResult.final_rank > 3 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface font-mono font-bold text-lg">
                <span className="text-muted-foreground">{myResult.final_rank}</span>
              </div>
              <div>
                <p className="font-semibold text-sm">{myResult.team_name} <span className="text-xs text-primary">(ditt lag)</span></p>
                <p className="text-xs text-muted-foreground">{myResult.points} poäng</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold">{formatSEK(myResult.final_value)}</p>
              <p className={`font-mono text-xs font-medium ${myResult.final_return_percent >= 0 ? "text-gain" : "text-loss"}`}>
                {myResult.final_return_percent >= 0 ? "+" : ""}{myResult.final_return_percent.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Full leaderboard */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-muted-foreground">Slutresultat</h4>
        <div className="space-y-2">
          {results.map((entry) => {
            const isOwn = myTeamIds.has(entry.team_id);
            const isPositive = entry.final_return_percent >= 0;
            return (
              <div
                key={entry.team_id}
                className={`flex items-center gap-3 rounded-xl border bg-card p-3 transition-all ${
                  entry.final_rank <= 3 ? "border-primary/20" : ""
                } ${isOwn ? "ring-2 ring-primary/50" : ""}`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface font-mono font-bold text-sm">
                  {entry.final_rank <= 3 ? (
                    <Trophy className={`h-4 w-4 ${TROPHY_COLORS[entry.final_rank - 1]}`} />
                  ) : (
                    <span className="text-muted-foreground">{entry.final_rank}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {entry.team_name}
                    {isOwn && <span className="ml-2 text-xs text-primary">(ditt lag)</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-semibold">{formatSEK(entry.final_value)}</p>
                  <p className={`font-mono text-xs font-medium ${isPositive ? "text-gain" : "text-loss"}`}>
                    {isPositive ? "+" : ""}{entry.final_return_percent.toFixed(1)}%
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] min-w-[40px] justify-center">
                  {entry.points}p
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
