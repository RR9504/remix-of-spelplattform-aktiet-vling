import { useEffect, useState } from "react";
import { Trophy, Loader2, BarChart3, TrendingUp, ArrowRightLeft, Hash } from "lucide-react";
import { formatSEK } from "@/lib/mockData";
import { getCompetitionResults, type CompetitionResult } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useCompetition } from "@/contexts/CompetitionContext";
import { Badge } from "@/components/ui/badge";

interface CompetitionResultsProps {
  competitionId: string;
  competitionName: string;
  startDate: string;
  endDate: string;
  initialBalance: number;
}

interface TradeStats {
  totalTrades: number;
  totalVolume: number;
  uniqueStocks: number;
  topStocks: { ticker: string; name: string; count: number }[];
  mostActiveTeam: { name: string; count: number } | null;
  tradesPerTeam: Record<string, number>;
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
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [loading, setLoading] = useState(true);

  const myTeamIds = new Set(teams.map((t) => t.id));

  useEffect(() => {
    setLoading(true);

    const fetchAll = async () => {
      const [resultsData, tradesRes] = await Promise.all([
        getCompetitionResults(competitionId),
        supabase
          .from("trades")
          .select("ticker, stock_name, side, total_sek, team_id")
          .eq("competition_id", competitionId),
      ]);

      setResults(resultsData);

      // Compute trade stats
      const trades = (tradesRes.data || []) as any[];
      if (trades.length > 0) {
        const stockCounts: Record<string, { name: string; count: number }> = {};
        const teamCounts: Record<string, number> = {};
        let totalVolume = 0;
        const tickers = new Set<string>();

        for (const t of trades) {
          tickers.add(t.ticker);
          totalVolume += Math.abs(Number(t.total_sek));
          // Stock popularity
          if (!stockCounts[t.ticker]) {
            stockCounts[t.ticker] = { name: t.stock_name || t.ticker, count: 0 };
          }
          stockCounts[t.ticker].count++;
          // Team activity
          teamCounts[t.team_id] = (teamCounts[t.team_id] || 0) + 1;
        }

        const topStocks = Object.entries(stockCounts)
          .map(([ticker, { name, count }]) => ({ ticker, name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        // Find most active team name from results
        let mostActiveTeam: TradeStats["mostActiveTeam"] = null;
        const topTeamEntry = Object.entries(teamCounts).sort((a, b) => b[1] - a[1])[0];
        if (topTeamEntry) {
          const teamResult = resultsData.find((r) => r.team_id === topTeamEntry[0]);
          mostActiveTeam = { name: teamResult?.team_name || "Okänt", count: topTeamEntry[1] };
        }

        setStats({
          totalTrades: trades.length,
          totalVolume,
          uniqueStocks: tickers.size,
          topStocks,
          mostActiveTeam,
          tradesPerTeam: teamCounts,
        });
      }

      setLoading(false);
    };

    fetchAll();
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

      {/* Trade Statistics */}
      {stats && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Tävlingsstatistik
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-card p-3 text-center">
              <ArrowRightLeft className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="font-mono text-lg font-bold">{stats.totalTrades}</p>
              <p className="text-[10px] text-muted-foreground">Totala affärer</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <TrendingUp className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="font-mono text-lg font-bold">{formatSEK(stats.totalVolume)}</p>
              <p className="text-[10px] text-muted-foreground">Total omsättning</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <Hash className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="font-mono text-lg font-bold">{stats.uniqueStocks}</p>
              <p className="text-[10px] text-muted-foreground">Unika aktier</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <Trophy className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
              <p className="font-mono text-sm font-bold truncate">{stats.mostActiveTeam?.name}</p>
              <p className="text-[10px] text-muted-foreground">
                Mest aktiva ({stats.mostActiveTeam?.count} affärer)
              </p>
            </div>
          </div>

          {/* Most traded stocks */}
          <div className="rounded-xl border bg-card p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Mest handlade aktier</p>
            <div className="space-y-1.5">
              {stats.topStocks.map((stock, i) => (
                <div key={stock.ticker} className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground w-4">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold truncate">{stock.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{stock.ticker}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(stock.count / stats.topStocks[0].count) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">
                      {stock.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
                  {stats && (
                    <p className="text-[10px] text-muted-foreground">
                      {stats.tradesPerTeam[entry.team_id] || 0} affärer
                    </p>
                  )}
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
