import { Navbar } from "@/components/Navbar";
import { StockSearch } from "@/components/StockSearch";
import { MarketStatus } from "@/components/MarketStatus";
import { NoCompetitionState } from "@/components/NoCompetitionState";
import { useCompetition } from "@/contexts/CompetitionContext";
import { formatSEK } from "@/lib/mockData";

const Trade = () => {
  const { activeCompetition, activeTeam, cashBalance } = useCompetition();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 pb-28 md:pb-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Handla</h1>
            {activeCompetition && activeTeam ? (
              <p className="text-muted-foreground text-sm">
                {activeTeam.name} · {activeCompetition.name} · Saldo: {formatSEK(cashBalance ?? 0)}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">Sök och handla aktier på svenska och amerikanska marknader</p>
            )}
          </div>
          <MarketStatus />
        </div>
        {!activeCompetition || !activeTeam ? (
          <NoCompetitionState />
        ) : (
          <StockSearch />
        )}
      </main>
    </div>
  );
};

export default Trade;
