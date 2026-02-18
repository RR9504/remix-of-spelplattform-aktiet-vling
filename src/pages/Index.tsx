import { Navbar } from "@/components/Navbar";
import { PortfolioChart } from "@/components/PortfolioChart";
import { HoldingsTable } from "@/components/HoldingsTable";
import { MarketStatus } from "@/components/MarketStatus";
import { formatSEK } from "@/lib/mockData";

const Index = () => {
  const cash = 731_456;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground text-sm">Börshajarna · 2 medlemmar</p>
          </div>
          <div className="flex items-center gap-4">
            <MarketStatus />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">Likvida medel</p>
            <p className="text-xl font-bold font-mono">{formatSEK(cash)}</p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">Aktievärde</p>
            <p className="text-xl font-bold font-mono">{formatSEK(1_085_300 - cash)}</p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">Antal positioner</p>
            <p className="text-xl font-bold font-mono">4</p>
          </div>
        </div>

        <PortfolioChart />
        <HoldingsTable />
      </main>
    </div>
  );
};

export default Index;
