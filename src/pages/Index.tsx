import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, HelpCircle } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { PortfolioChart } from "@/components/PortfolioChart";
import { HoldingsTable } from "@/components/HoldingsTable";
import { PendingOrdersList } from "@/components/PendingOrdersList";
import { CompetitionChat } from "@/components/CompetitionChat";
import { PortfolioDiversification } from "@/components/PortfolioDiversification";
import { MarketStatus } from "@/components/MarketStatus";
import { WelcomeDialog } from "@/components/WelcomeDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatSEK } from "@/lib/mockData";
import { getPortfolio } from "@/lib/api";
import { useCompetition } from "@/contexts/CompetitionContext";
import type { Portfolio } from "@/types/trading";

function getCachedPortfolio(compId: string, teamId: string): Portfolio | null {
  try {
    const raw = localStorage.getItem(`sa_portfolio_${compId}_${teamId}`);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    // Use cache if less than 10 minutes old
    if (Date.now() - ts > 10 * 60 * 1000) return null;
    return data as Portfolio;
  } catch {
    return null;
  }
}

function setCachedPortfolio(compId: string, teamId: string, data: Portfolio) {
  try {
    localStorage.setItem(
      `sa_portfolio_${compId}_${teamId}`,
      JSON.stringify({ data, ts: Date.now() })
    );
  } catch {}
}

const Index = () => {
  const { activeCompetition, activeTeam, competitions, teamsForActiveCompetition, setActiveCompetitionId, setActiveTeamId, loading: ctxLoading } = useCompetition();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem("stockarena_tutorial_seen"));

  useEffect(() => {
    if (!activeCompetition || !activeTeam) {
      setPortfolio(null);
      return;
    }

    // Show cached data immediately — no spinner
    const cached = getCachedPortfolio(activeCompetition.id, activeTeam.id);
    if (cached) {
      setPortfolio(cached);
    }

    // Fetch fresh data in background
    setRefreshing(true);
    getPortfolio(activeCompetition.id, activeTeam.id)
      .then((data) => {
        if (data) {
          setPortfolio(data);
          setCachedPortfolio(activeCompetition.id, activeTeam.id, data);
        }
      })
      .catch((err) => {
        console.error("Failed to load portfolio:", err);
      })
      .finally(() => {
        setRefreshing(false);
      });

    // Auto-refresh portfolio every 60 seconds
    const interval = setInterval(() => {
      getPortfolio(activeCompetition.id, activeTeam.id)
        .then((data) => {
          if (data) {
            setPortfolio(data);
            setCachedPortfolio(activeCompetition.id, activeTeam.id, data);
          }
        })
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, [activeCompetition?.id, activeTeam?.id]);

  if (ctxLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container py-6 pb-28 md:pb-6 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!activeCompetition || !activeTeam) {
    return <Navigate to="/onboarding" replace />;
  }

  const cash = portfolio?.cash ?? activeCompetition.initial_balance;
  const holdingsValue = portfolio?.holdings_value ?? 0;
  const totalValue = portfolio?.total_value ?? cash;
  const positions = portfolio?.holdings?.length ?? 0;
  const marginReserved = portfolio?.margin_reserved ?? 0;
  const hasShorts = (portfolio?.short_positions?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <WelcomeDialog open={showGuide} onClose={() => setShowGuide(false)} />
      <main className="container py-6 pb-28 md:pb-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold">Dashboard</h1>
              <p className="text-muted-foreground text-sm">
                {activeTeam.name} · {activeCompetition.name}
              </p>
            </div>
            {competitions.length > 1 && (
              <Select
                value={activeCompetition.id}
                onValueChange={(v) => setActiveCompetitionId(v)}
              >
                <SelectTrigger className="w-full sm:w-[180px] h-9 text-xs">
                  <SelectValue placeholder="Byt tävling" />
                </SelectTrigger>
                <SelectContent>
                  {competitions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {teamsForActiveCompetition.length > 1 && (
              <Select
                value={activeTeam.id}
                onValueChange={(v) => setActiveTeamId(v)}
              >
                <SelectTrigger className="w-full sm:w-[140px] h-9 text-xs">
                  <SelectValue placeholder="Byt lag" />
                </SelectTrigger>
                <SelectContent>
                  {teamsForActiveCompetition.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex">
              <MarketStatus />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowGuide(true)}
              title="Visa guide"
            >
              <HelpCircle className="h-5 w-5 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {!portfolio && refreshing ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {refreshing && portfolio && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Uppdaterar...</span>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border bg-card p-3 sm:p-5">
                <p className="text-sm text-muted-foreground">
                  {hasShorts ? "Tillgängligt saldo" : "Likvida medel"}
                </p>
                <p className="text-lg sm:text-xl font-bold font-mono">
                  {formatSEK(hasShorts ? cash - marginReserved : cash)}
                </p>
                {hasShorts && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Totalt: {formatSEK(cash)} · Marginal: {formatSEK(marginReserved)}
                  </p>
                )}
              </div>
              <div className="rounded-xl border bg-card p-3 sm:p-5">
                <p className="text-sm text-muted-foreground">Aktievärde</p>
                <p className="text-lg sm:text-xl font-bold font-mono">{formatSEK(holdingsValue)}</p>
              </div>
              <div className="rounded-xl border bg-card p-3 sm:p-5">
                <p className="text-sm text-muted-foreground">Portföljvärde</p>
                <p className="text-lg sm:text-xl font-bold font-mono">{formatSEK(totalValue)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {((totalValue / activeCompetition.initial_balance - 1) * 100).toFixed(1)}% avkastning
                </p>
              </div>
            </div>

            <Tabs defaultValue="chart">
              <TabsList>
                <TabsTrigger value="chart">Värdeutveckling</TabsTrigger>
                <TabsTrigger value="diversification">Fördelning</TabsTrigger>
              </TabsList>
              <TabsContent value="chart">
                <PortfolioChart
                  currentValue={totalValue}
                  startValue={activeCompetition.initial_balance}
                />
              </TabsContent>
              <TabsContent value="diversification">
                <PortfolioDiversification
                  holdings={portfolio?.holdings ?? []}
                  shortPositions={portfolio?.short_positions}
                  cash={cash}
                />
              </TabsContent>
            </Tabs>
            <HoldingsTable
              holdings={portfolio?.holdings ?? []}
              shortPositions={portfolio?.short_positions}
              totalValue={totalValue}
            />
            <PendingOrdersList />
            <CompetitionChat />
          </>
        )}
      </main>
    </div>
  );
};

export default Index;
