import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
import { formatSEK } from "@/lib/mockData";
import { getPortfolio } from "@/lib/api";
import { useCompetition } from "@/contexts/CompetitionContext";
import type { Portfolio } from "@/types/trading";

const Index = () => {
  const { activeCompetition, activeTeam, loading: ctxLoading } = useCompetition();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem("stockarena_tutorial_seen"));

  useEffect(() => {
    if (!activeCompetition || !activeTeam) {
      setPortfolio(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    getPortfolio(activeCompetition.id, activeTeam.id).then((data) => {
      setPortfolio(data);
      setLoading(false);
    });

    // Auto-refresh portfolio every 60 seconds
    const interval = setInterval(() => {
      getPortfolio(activeCompetition.id, activeTeam.id).then((data) => {
        if (data) setPortfolio(data);
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, [activeCompetition?.id, activeTeam?.id]);

  if (ctxLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container py-6 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!activeCompetition || !activeTeam) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container py-6 space-y-6">
          <div className="text-center py-16">
            <h1 className="text-2xl font-bold mb-2">Välkommen till StockArena!</h1>
            <p className="text-muted-foreground mb-6">
              Gå med i en tävling eller skapa en ny för att börja handla.
            </p>
            <div className="flex gap-4 justify-center">
              <Link to="/competitions">
                <Button>Hitta tävlingar</Button>
              </Link>
              <Link to="/onboarding">
                <Button variant="outline">Kom igång</Button>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
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
      <main className="container py-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground text-sm">
              {activeTeam.name} · {activeCompetition.name}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <MarketStatus />
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

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">
                  {hasShorts ? "Tillgängligt saldo" : "Likvida medel"}
                </p>
                <p className="text-xl font-bold font-mono">
                  {formatSEK(hasShorts ? cash - marginReserved : cash)}
                </p>
                {hasShorts && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Totalt: {formatSEK(cash)} · Marginal: {formatSEK(marginReserved)}
                  </p>
                )}
              </div>
              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">Aktievärde</p>
                <p className="text-xl font-bold font-mono">{formatSEK(holdingsValue)}</p>
              </div>
              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">Portföljvärde</p>
                <p className="text-xl font-bold font-mono">{formatSEK(totalValue)}</p>
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
