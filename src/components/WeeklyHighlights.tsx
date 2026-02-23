import { useEffect, useState } from "react";
import { Rocket, Crown, Loader2, TrendingUp, ArrowDownRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompetition } from "@/contexts/CompetitionContext";
import { formatSEK } from "@/lib/mockData";
import confetti from "canvas-confetti";
import { motion } from "framer-motion";

interface RocketStock {
  ticker: string;
  stock_name: string;
  team_name: string;
  change_percent: number;
}

interface WeeklyWinner {
  team_name: string;
  total_value: number;
  return_percent: number;
}

interface BiggestTrade {
  ticker: string;
  stock_name: string;
  team_name: string;
  total_sek: number;
  side: "buy" | "sell";
  shares: number;
}

export function WeeklyHighlights() {
  const { activeCompetition } = useCompetition();
  const [rocket, setRocket] = useState<RocketStock | null>(null);
  const [winner, setWinner] = useState<WeeklyWinner | null>(null);
  const [biggestTrade, setBiggestTrade] = useState<BiggestTrade | null>(null);
  const [loading, setLoading] = useState(true);
  const [firedConfetti, setFiredConfetti] = useState(false);

  useEffect(() => {
    if (!activeCompetition) {
      setLoading(false);
      return;
    }
    fetchHighlights();
  }, [activeCompetition?.id]);

  useEffect(() => {
    if ((rocket || winner) && !firedConfetti) {
      setFiredConfetti(true);
      const timer = setTimeout(() => {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#2dd4bf", "#fbbf24", "#f472b6"],
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [rocket, winner, firedConfetti]);

  const fetchHighlights = async () => {
    if (!activeCompetition) return;
    setLoading(true);

    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString();

    // Get all trades from this week in the competition
    const { data: trades } = await supabase
      .from("trades")
      .select("ticker, stock_name, team_id, side, shares, price_per_share, total_sek, executed_at")
      .eq("competition_id", activeCompetition.id)
      .gte("executed_at", weekAgoStr)
      .order("executed_at", { ascending: true });

    // Get cached prices for tickers
    const tickers = [...new Set((trades || []).map((t: any) => t.ticker))];
    let priceMap: Record<string, number> = {};
    if (tickers.length > 0) {
      const { data: prices } = await supabase
        .from("stock_price_cache")
        .select("ticker, price_sek")
        .in("ticker", tickers);
      for (const p of (prices || []) as any[]) {
        priceMap[p.ticker] = Number(p.price_sek);
      }
    }

    // Get teams in competition
    const { data: ctRows } = await supabase
      .from("competition_teams")
      .select("team_id, cash_balance_sek")
      .eq("competition_id", activeCompetition.id);

    const teamIds = (ctRows || []).map((r: any) => r.team_id);
    let teamNameMap: Record<string, string> = {};
    if (teamIds.length > 0) {
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name")
        .in("id", teamIds);
      for (const t of (teams || []) as any[]) {
        teamNameMap[t.id] = t.name;
      }
    }

    // --- Veckans Raket: stock with best price performance held by any team ---
    // For each ticker traded this week, compute change between first buy price and current price
    const tickerFirstBuy: Record<string, { price_sek: number; team_id: string; stock_name: string }> = {};
    for (const t of (trades || []) as any[]) {
      if (t.side === "buy" && !tickerFirstBuy[t.ticker]) {
        tickerFirstBuy[t.ticker] = {
          price_sek: Number(t.total_sek) / Number(t.shares),
          team_id: t.team_id,
          stock_name: t.stock_name,
        };
      }
    }

    let bestRocket: RocketStock | null = null;
    for (const [ticker, info] of Object.entries(tickerFirstBuy)) {
      const currentPrice = priceMap[ticker];
      if (!currentPrice || info.price_sek <= 0) continue;
      const changePct = ((currentPrice - info.price_sek) / info.price_sek) * 100;
      if (!bestRocket || changePct > bestRocket.change_percent) {
        bestRocket = {
          ticker,
          stock_name: info.stock_name,
          team_name: teamNameMap[info.team_id] || "Okänt lag",
          change_percent: Math.round(changePct * 100) / 100,
        };
      }
    }
    setRocket(bestRocket);

    // --- Veckans Vinnare: team with best return ---
    // Get all holdings for teams
    const { data: allHoldings } = await supabase
      .from("team_holdings")
      .select("*")
      .eq("competition_id", activeCompetition.id)
      .in("team_id", teamIds);

    const startCapital = Number(activeCompetition.initial_balance);
    let bestWinner: WeeklyWinner | null = null;

    for (const ct of (ctRows || []) as any[]) {
      const cash = Number(ct.cash_balance_sek);
      const teamHoldings = (allHoldings || []).filter((h: any) => h.team_id === ct.team_id);
      let holdingsValue = 0;
      for (const h of teamHoldings as any[]) {
        const priceSek = priceMap[h.ticker] ?? Number(h.avg_cost_per_share_sek);
        holdingsValue += Number(h.total_shares) * priceSek;
      }
      const totalValue = cash + holdingsValue;
      const returnPct = startCapital > 0 ? ((totalValue - startCapital) / startCapital) * 100 : 0;

      if (!bestWinner || returnPct > bestWinner.return_percent) {
        bestWinner = {
          team_name: teamNameMap[ct.team_id] || "Okänt lag",
          total_value: Math.round(totalValue),
          return_percent: Math.round(returnPct * 100) / 100,
        };
      }
    }
    setWinner(bestWinner);

    // --- Största affären denna vecka ---
    let biggest: BiggestTrade | null = null;
    for (const t of (trades || []) as any[]) {
      const sek = Number(t.total_sek);
      if (!biggest || sek > biggest.total_sek) {
        biggest = {
          ticker: t.ticker,
          stock_name: t.stock_name,
          team_name: teamNameMap[t.team_id] || "Okänt lag",
          total_sek: sek,
          side: t.side,
          shares: t.shares,
        };
      }
    }
    setBiggestTrade(biggest);

    setLoading(false);
  };

  if (!activeCompetition) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Gå med i en tävling för att se highlights.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasData = rocket || winner || biggestTrade;

  if (!hasData) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Inga highlights ännu. Börja handla så dyker de upp här!</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {rocket && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-xl border bg-card p-8"
        >
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Rocket className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Veckans Raket</p>
              <p className="text-xl font-bold">Bäst presterande aktie</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl font-bold">{rocket.ticker}</span>
              <span className="text-muted-foreground">{rocket.stock_name}</span>
            </div>
            <p className={`text-3xl font-bold font-mono ${rocket.change_percent >= 0 ? "text-gain" : "text-loss"}`}>
              {rocket.change_percent >= 0 ? "+" : ""}{rocket.change_percent}%
            </p>
            <p className="text-sm text-muted-foreground">
              I <span className="font-semibold text-foreground">{rocket.team_name}</span>s portfölj
            </p>
          </div>
        </motion.div>
      )}

      {winner && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="relative overflow-hidden rounded-xl border bg-card p-8"
        >
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-yellow-400/10 blur-2xl" />
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-400/10">
              <Crown className="h-6 w-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ledande laget</p>
              <p className="text-xl font-bold">Bästa totalavkastning</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-2xl font-bold">{winner.team_name}</p>
            <p className={`text-3xl font-bold font-mono ${winner.return_percent >= 0 ? "text-gain" : "text-loss"}`}>
              {winner.return_percent >= 0 ? "+" : ""}{winner.return_percent}%
            </p>
            <p className="text-sm text-muted-foreground">
              Portföljvärde: <span className="font-mono font-semibold text-foreground">{formatSEK(winner.total_value)}</span>
            </p>
          </div>
        </motion.div>
      )}

      {biggestTrade && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="relative overflow-hidden rounded-xl border bg-card p-8 md:col-span-2"
        >
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              {biggestTrade.side === "buy" ? (
                <TrendingUp className="h-6 w-6 text-primary" />
              ) : (
                <ArrowDownRight className="h-6 w-6 text-primary" />
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Veckans största affär</p>
              <p className="text-xl font-bold">
                {biggestTrade.side === "buy" ? "Köp" : "Sälj"} av {biggestTrade.ticker}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl font-bold">{biggestTrade.shares} st</span>
              <span className="text-muted-foreground">{biggestTrade.stock_name}</span>
            </div>
            <p className="text-3xl font-bold font-mono">{formatSEK(biggestTrade.total_sek)}</p>
            <p className="text-sm text-muted-foreground">
              Av <span className="font-semibold text-foreground">{biggestTrade.team_name}</span>
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
