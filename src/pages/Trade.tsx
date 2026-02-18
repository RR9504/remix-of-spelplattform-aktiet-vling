import { Navbar } from "@/components/Navbar";
import { StockSearch } from "@/components/StockSearch";
import { MarketStatus } from "@/components/MarketStatus";

const Trade = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Handla</h1>
            <p className="text-muted-foreground text-sm">Sök och handla aktier på svenska och amerikanska marknader</p>
          </div>
          <MarketStatus />
        </div>
        <StockSearch />
      </main>
    </div>
  );
};

export default Trade;
