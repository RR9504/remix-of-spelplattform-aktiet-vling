import { mockTeams, formatSEK } from "@/lib/mockData";
import { Trophy } from "lucide-react";

export function LeaderboardTable() {
  const sorted = [...mockTeams].sort((a, b) => b.returnPercent - a.returnPercent);

  return (
    <div className="space-y-3">
      {sorted.map((team, i) => {
        const isPositive = team.returnPercent >= 0;
        const rank = i + 1;
        return (
          <div
            key={team.name}
            className={`flex items-center gap-4 rounded-xl border bg-card p-4 transition-all hover:bg-muted ${rank <= 3 ? 'glow-primary border-primary/20' : ''}`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface font-mono font-bold text-lg">
              {rank <= 3 ? (
                <Trophy className={`h-5 w-5 ${rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-gray-400' : 'text-amber-600'}`} />
              ) : (
                <span className="text-muted-foreground">{rank}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{team.name}</p>
              <p className="text-xs text-muted-foreground">{team.members.join(', ')}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold">{formatSEK(team.totalValue)}</p>
              <p className={`font-mono text-xs font-medium ${isPositive ? 'text-gain' : 'text-loss'}`}>
                {isPositive ? '+' : ''}{team.returnPercent.toFixed(2)}% ({isPositive ? '+' : ''}{formatSEK(team.returnAmount)})
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
