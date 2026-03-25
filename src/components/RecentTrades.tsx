import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { formatSEK } from "@/lib/mockData";
import { getTradeHistory } from "@/lib/api";
import { useCompetition } from "@/contexts/CompetitionContext";
import type { TradeHistoryEntry } from "@/types/trading";

const SIDE_LABELS: Record<string, string> = {
  buy: "Köp",
  sell: "Sälj",
  short: "Blanka",
  cover: "Täck",
};

const INITIAL_COUNT = 5;

export function RecentTrades() {
  const { activeCompetition, activeTeam } = useCompetition();
  const [trades, setTrades] = useState<TradeHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!activeCompetition || !activeTeam) {
      setTrades([]);
      return;
    }
    getTradeHistory({
      competition_id: activeCompetition.id,
      team_id: activeTeam.id,
      limit: 20,
    }).then((data) => {
      setTrades(data.trades);
      setTotal(data.total);
    });
  }, [activeCompetition?.id, activeTeam?.id]);

  if (trades.length === 0) return null;

  const visibleTrades = expanded ? trades : trades.slice(0, INITIAL_COUNT);
  const hasMore = total > trades.length;

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Senaste affärer</h2>
        <Link to="/history">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
            Alla affärer
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      </div>

      <div className="space-y-2">
        {visibleTrades.map((trade) => {
          const pnl = trade.realized_pnl_sek;
          const pnlPositive = pnl !== null && pnl !== undefined && pnl >= 0;
          const isBuyish = trade.side === "buy" || trade.side === "cover";

          return (
            <div key={trade.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="flex items-center gap-3 min-w-0">
                <Badge
                  variant="outline"
                  className={`text-xs shrink-0 ${
                    isBuyish ? "border-gain text-gain" : "border-loss text-loss"
                  }`}
                >
                  {SIDE_LABELS[trade.side] || trade.side}
                </Badge>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-sm">{trade.ticker}</span>
                    <span className="text-xs text-muted-foreground">
                      {trade.shares} st
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(trade.executed_at).toLocaleDateString("sv-SE")}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className="font-mono text-sm">{formatSEK(trade.total_sek)}</p>
                {pnl !== null && pnl !== undefined && (
                  <p className={`font-mono text-xs ${pnlPositive ? "text-gain" : "text-loss"}`}>
                    {pnlPositive ? "+" : ""}{formatSEK(pnl)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!expanded && trades.length > INITIAL_COUNT && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-2 text-xs text-muted-foreground"
          onClick={() => setExpanded(true)}
        >
          Visa {Math.min(trades.length, 20) - INITIAL_COUNT} till
        </Button>
      )}
      {expanded && hasMore && (
        <Link to="/history" className="block mt-2">
          <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
            Visa alla {total} affärer
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      )}
    </div>
  );
}
