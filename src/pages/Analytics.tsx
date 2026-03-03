import { useEffect, useState, useMemo } from "react";
import { Loader2, TrendingUp, TrendingDown, BarChart3, Target, Percent, DollarSign, Activity } from "lucide-react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from "recharts";
import { Navbar } from "@/components/Navbar";
import { useCompetition } from "@/contexts/CompetitionContext";
import { formatSEK } from "@/lib/mockData";
import { supabase } from "@/integrations/supabase/client";

interface TradeRow {
  id: string;
  ticker: string;
  stock_name: string;
  side: string;
  shares: number;
  total_sek: number;
  realized_pnl_sek: number | null;
  executed_at: string;
}

interface SnapshotRow {
  snapshot_date: string;
  total_value_sek: number;
  cash_sek: number;
  holdings_value_sek: number;
}

const Analytics = () => {
  const { activeCompetition, activeTeam } = useCompetition();
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeCompetition || !activeTeam) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      const [tradesRes, snapshotsRes] = await Promise.all([
        supabase
          .from("trades")
          .select("id, ticker, stock_name, side, shares, total_sek, realized_pnl_sek, executed_at")
          .eq("competition_id", activeCompetition.id)
          .eq("team_id", activeTeam.id)
          .order("executed_at", { ascending: true }),
        supabase
          .from("portfolio_snapshots")
          .select("snapshot_date, total_value_sek, cash_sek, holdings_value_sek")
          .eq("competition_id", activeCompetition.id)
          .eq("team_id", activeTeam.id)
          .order("snapshot_date", { ascending: true }),
      ]);

      setTrades((tradesRes.data as unknown as TradeRow[]) || []);
      setSnapshots((snapshotsRes.data as unknown as SnapshotRow[]) || []);
      setLoading(false);
    };

    load();
  }, [activeCompetition?.id, activeTeam?.id]);

  const stats = useMemo(() => {
    if (trades.length === 0) return null;

    const buys = trades.filter((t) => t.side === "buy");
    const sells = trades.filter((t) => t.side === "sell");
    const shorts = trades.filter((t) => t.side === "short");
    const covers = trades.filter((t) => t.side === "cover");

    // Realized P&L from sells and covers
    const closedTrades = [...sells, ...covers].filter((t) => t.realized_pnl_sek != null);
    const winners = closedTrades.filter((t) => (t.realized_pnl_sek ?? 0) > 0);
    const losers = closedTrades.filter((t) => (t.realized_pnl_sek ?? 0) < 0);
    const winRate = closedTrades.length > 0 ? (winners.length / closedTrades.length) * 100 : 0;

    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.realized_pnl_sek ?? 0), 0);
    const bestTrade = closedTrades.reduce((best, t) => ((t.realized_pnl_sek ?? 0) > (best?.realized_pnl_sek ?? -Infinity) ? t : best), closedTrades[0]);
    const worstTrade = closedTrades.reduce((worst, t) => ((t.realized_pnl_sek ?? 0) < (worst?.realized_pnl_sek ?? Infinity) ? t : worst), closedTrades[0]);

    const avgTradeSize = trades.reduce((sum, t) => sum + Number(t.total_sek), 0) / trades.length;

    // Unique stocks traded
    const uniqueTickers = new Set(trades.map((t) => t.ticker));

    // P&L by stock
    const pnlByStock: Record<string, { ticker: string; name: string; pnl: number; trades: number }> = {};
    for (const t of closedTrades) {
      if (!pnlByStock[t.ticker]) {
        pnlByStock[t.ticker] = { ticker: t.ticker, name: t.stock_name, pnl: 0, trades: 0 };
      }
      pnlByStock[t.ticker].pnl += t.realized_pnl_sek ?? 0;
      pnlByStock[t.ticker].trades++;
    }
    const pnlByStockArr = Object.values(pnlByStock).sort((a, b) => b.pnl - a.pnl);

    // Trades per day for activity chart
    const tradesByDay: Record<string, number> = {};
    for (const t of trades) {
      const day = t.executed_at.split("T")[0];
      tradesByDay[day] = (tradesByDay[day] || 0) + 1;
    }
    const activityData = Object.entries(tradesByDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalTrades: trades.length,
      buys: buys.length,
      sells: sells.length,
      shorts: shorts.length,
      covers: covers.length,
      closedTrades: closedTrades.length,
      winRate,
      totalPnl,
      bestTrade,
      worstTrade,
      avgTradeSize,
      uniqueTickers: uniqueTickers.size,
      pnlByStock: pnlByStockArr,
      activityData,
    };
  }, [trades]);

  // Portfolio value chart data
  const portfolioData = useMemo(() => {
    if (snapshots.length === 0) return [];
    return snapshots.map((s) => ({
      date: s.snapshot_date,
      value: Number(s.total_value_sek),
      cash: Number(s.cash_sek),
      holdings: Number(s.holdings_value_sek),
    }));
  }, [snapshots]);

  // Drawdown calculation
  const drawdownData = useMemo(() => {
    if (snapshots.length === 0) return { maxDrawdown: 0, data: [] };
    let peak = 0;
    let maxDd = 0;
    const data = snapshots.map((s) => {
      const val = Number(s.total_value_sek);
      if (val > peak) peak = val;
      const dd = peak > 0 ? ((val - peak) / peak) * 100 : 0;
      if (dd < maxDd) maxDd = dd;
      return { date: s.snapshot_date, drawdown: Math.round(dd * 100) / 100 };
    });
    return { maxDrawdown: Math.round(maxDd * 100) / 100, data };
  }, [snapshots]);

  if (!activeCompetition || !activeTeam) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container py-6 pb-20 md:pb-6">
          <p className="text-muted-foreground text-center py-16">Välj en aktiv tävling för att se analys.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 pb-20 md:pb-6 space-y-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Portföljanalys</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !stats || trades.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center">
            <p className="text-muted-foreground text-sm">Inga affärer ännu. Gör din första affär för att se statistik.</p>
          </div>
        ) : (
          <>
            {/* Key metrics cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard icon={Activity} label="Totalt affärer" value={String(stats.totalTrades)} />
              <MetricCard icon={Target} label="Vinstrate" value={`${stats.winRate.toFixed(0)}%`} sub={`${stats.closedTrades} stängda`} />
              <MetricCard icon={DollarSign} label="Realiserad P&L" value={formatSEK(stats.totalPnl)} positive={stats.totalPnl >= 0} />
              <MetricCard icon={Percent} label="Snittaffär" value={formatSEK(stats.avgTradeSize)} />
            </div>

            {/* Best / worst trade */}
            {stats.bestTrade && stats.worstTrade && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <TrendingUp className="h-4 w-4 text-gain" />
                    Bästa affären
                  </div>
                  <p className="font-semibold">
                    {stats.bestTrade.stock_name} ({stats.bestTrade.ticker})
                  </p>
                  <p className="text-gain font-mono text-lg">{formatSEK(stats.bestTrade.realized_pnl_sek ?? 0)}</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <TrendingDown className="h-4 w-4 text-loss" />
                    Sämsta affären
                  </div>
                  <p className="font-semibold">
                    {stats.worstTrade.stock_name} ({stats.worstTrade.ticker})
                  </p>
                  <p className="text-loss font-mono text-lg">{formatSEK(stats.worstTrade.realized_pnl_sek ?? 0)}</p>
                </div>
              </div>
            )}

            {/* Portfolio value over time */}
            {portfolioData.length > 1 && (
              <div className="rounded-xl border bg-card p-4">
                <h2 className="text-sm font-semibold mb-3">Portföljvärde över tid</h2>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={portfolioData}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <Tooltip
                        contentStyle={{ background: "hsl(222, 25%, 9%)", border: "1px solid hsl(222, 25%, 20%)", borderRadius: 8, fontSize: 12 }}
                        formatter={(v: number) => [formatSEK(v), "Värde"]}
                      />
                      <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorValue)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Drawdown chart */}
            {drawdownData.data.length > 1 && (
              <div className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Drawdown</h2>
                  <span className="text-xs text-loss font-mono">Max: {drawdownData.maxDrawdown}%</span>
                </div>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={drawdownData.data}>
                      <defs>
                        <linearGradient id="colorDd" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(0, 70%, 50%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(0, 70%, 50%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        contentStyle={{ background: "hsl(222, 25%, 9%)", border: "1px solid hsl(222, 25%, 20%)", borderRadius: 8, fontSize: 12 }}
                        formatter={(v: number) => [`${v}%`, "Drawdown"]}
                      />
                      <Area type="monotone" dataKey="drawdown" stroke="hsl(0, 70%, 50%)" fillOpacity={1} fill="url(#colorDd)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* P&L by stock */}
            {stats.pnlByStock.length > 0 && (
              <div className="rounded-xl border bg-card p-4">
                <h2 className="text-sm font-semibold mb-3">P&L per aktie</h2>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.pnlByStock.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 25%, 15%)" />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <YAxis type="category" dataKey="ticker" tick={{ fontSize: 10 }} width={70} />
                      <Tooltip
                        contentStyle={{ background: "hsl(222, 25%, 9%)", border: "1px solid hsl(222, 25%, 20%)", borderRadius: 8, fontSize: 12 }}
                        formatter={(v: number) => [formatSEK(v), "P&L"]}
                      />
                      <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
                        {stats.pnlByStock.slice(0, 10).map((entry, i) => (
                          <Cell key={i} fill={entry.pnl >= 0 ? "hsl(142, 70%, 45%)" : "hsl(0, 70%, 50%)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Trading activity */}
            {stats.activityData.length > 1 && (
              <div className="rounded-xl border bg-card p-4">
                <h2 className="text-sm font-semibold mb-3">Handelsaktivitet</h2>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.activityData}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: "hsl(222, 25%, 9%)", border: "1px solid hsl(222, 25%, 20%)", borderRadius: 8, fontSize: 12 }}
                        formatter={(v: number) => [v, "Affärer"]}
                      />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Trade breakdown */}
            <div className="rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold mb-3">Handelsfördelning</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Köp</p>
                  <p className="text-lg font-mono font-semibold">{stats.buys}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Sälj</p>
                  <p className="text-lg font-mono font-semibold">{stats.sells}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Blankning</p>
                  <p className="text-lg font-mono font-semibold">{stats.shorts}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Täckning</p>
                  <p className="text-lg font-mono font-semibold">{stats.covers}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Unika aktier</p>
                  <p className="text-lg font-mono font-semibold">{stats.uniqueTickers}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  positive,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`text-lg font-mono font-semibold ${positive === true ? "text-gain" : positive === false ? "text-loss" : ""}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default Analytics;
