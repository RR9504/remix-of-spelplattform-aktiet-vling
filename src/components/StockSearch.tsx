import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchStocks, fetchStockPrice } from "@/lib/api";
import type { StockSearchResult, StockPrice } from "@/types/trading";
import { TradeDialog } from "./TradeDialog";
import { WatchlistButton } from "./WatchlistButton";

export function StockSearch({ initialQuery }: { initialQuery?: string } = {}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery || "");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState<(StockSearchResult & { priceData?: StockPrice }) | null>(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Update query when initialQuery changes (e.g. from cert button click)
  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 1) {
      setResults([]);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const data = await searchStocks(query);
      setResults(data);
      setLoading(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleSelect = async (stock: StockSearchResult) => {
    setFetchingPrice(true);
    const priceData = await fetchStockPrice(stock.ticker);
    setSelectedStock({ ...stock, priceData: priceData ?? undefined });
    setFetchingPrice(false);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Sök aktie, krypto, råvara (t.ex. AAPL, BTC-USD, GC=F)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10 bg-card"
        />
        {(loading || fetchingPrice) && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="grid gap-2">
        {!loading && query.length > 0 && results.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Inga resultat hittades</p>
        )}
        {results.map((stock) => (
          <button
            key={stock.ticker}
            onClick={() => handleSelect(stock)}
            disabled={fetchingPrice}
            className="flex items-center justify-between rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{
                stock.ticker.includes("-USD") || stock.ticker.includes("-EUR") || stock.ticker.includes("-GBP") ? "🪙" :
                stock.ticker.endsWith("=F") ? "📦" :
                stock.exchange?.includes("Stockholm") || stock.ticker.endsWith(".ST") ? "🇸🇪" : "🇺🇸"
              }</span>
              <div>
                <p className="font-mono font-semibold text-sm">{stock.ticker}</p>
                <p className="text-xs text-muted-foreground">{stock.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <p className="text-xs text-muted-foreground">{stock.exchange}</p>
                <p className="text-xs text-muted-foreground">{stock.currency}</p>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <WatchlistButton ticker={stock.ticker} stockName={stock.name} />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/stock/${encodeURIComponent(stock.ticker)}`);
                }}
                className="p-1 rounded hover:bg-muted-foreground/10"
                title="Visa detaljer"
              >
                <Info className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </button>
        ))}
      </div>
      {selectedStock && (
        <TradeDialog
          stock={selectedStock}
          priceData={selectedStock.priceData ?? null}
          onClose={() => setSelectedStock(null)}
        />
      )}
    </div>
  );
}
