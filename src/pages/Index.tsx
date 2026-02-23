import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { PortfolioChart } from "@/components/PortfolioChart";
import { HoldingsTable } from "@/components/HoldingsTable";
import { MarketStatus } from "@/components/MarketStatus";
import { Button } from "@/components/ui/button";
import { formatSEK } from "@/lib/mockData";
import { getPortfolio } from "@/lib/api";
import { useCompetition } from "@/contexts/CompetitionContext";
import type { Portfolio } from "@/types/trading";

const Index = () => {
  const { activeCompetition, activeTeam, loading: ctxLoading } = useCompetition();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
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
                <p className="text-sm text-muted-foreground">Likvida medel</p>
                <p className="text-xl font-bold font-mono">{formatSEK(cash)}</p>
              </div>
              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">Aktievärde</p>
                <p className="text-xl font-bold font-mono">{formatSEK(holdingsValue)}</p>
              </div>
              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">Antal positioner</p>
                <p className="text-xl font-bold font-mono">{positions}</p>
              </div>
            </div>

            <PortfolioChart
              currentValue={totalValue}
              startValue={activeCompetition.initial_balance}
            />
            <HoldingsTable holdings={portfolio?.holdings ?? []} />
          </>
        )}
      </main>
    </div>
  );
};

export default Index;
