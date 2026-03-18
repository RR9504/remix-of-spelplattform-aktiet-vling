import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchStocks, fetchStockPrice } from "@/lib/api";
import type { StockSearchResult, StockPrice } from "@/types/trading";
import { TradeDialog } from "./TradeDialog";
import { WatchlistButton } from "./WatchlistButton";

type FilterType = "ALL" | "EQUITY" | "ETF" | "CRYPTOCURRENCY" | "CERTIFICATE";

const FILTER_LABELS: Record<FilterType, string> = {
  ALL: "Alla",
  EQUITY: "Aktier",
  ETF: "ETF:er",
  CRYPTOCURRENCY: "Krypto",
  CERTIFICATE: "Certifikat",
};

function classifyResult(stock: StockSearchResult): FilterType {
  if (stock.type === "CERTIFICATE") return "CERTIFICATE";
  if (stock.type === "ETF") return "ETF";
  if (stock.type === "CRYPTOCURRENCY") return "CRYPTOCURRENCY";
  // Heuristic: Bull/Bear tickers on Stockholm are certificates
  if (/^(BULL|BEAR)-/i.test(stock.ticker)) return "CERTIFICATE";
  return "EQUITY";
}

export function StockSearch({ initialQuery }: { initialQuery?: string } = {}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery || "");
  const [results, setResults] = useState<StockSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState<(StockSearchResult & { priceData?: StockPrice }) | null>(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [filter, setFilter] = useState<FilterType>("ALL");
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

  // Compute which filter types are available in current results
  const availableTypes = useMemo(() => {
    const types = new Set<FilterType>();
    results.forEach((r) => types.add(classifyResult(r)));
    return types;
  }, [results]);

  const filteredResults = useMemo(() => {
    if (filter === "ALL") return results;
    return results.filter((r) => classifyResult(r) === filter);
  }, [results, filter]);

  // Reset filter when results change
  useEffect(() => {
    setFilter("ALL");
  }, [results]);

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
      {results.length > 1 && availableTypes.size > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(FILTER_LABELS) as FilterType[])
            .filter((t) => t === "ALL" || availableTypes.has(t))
            .map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  filter === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {FILTER_LABELS[t]}
                {t !== "ALL" && (
                  <span className="ml-1 opacity-60">
                    {results.filter((r) => classifyResult(r) === t).length}
                  </span>
                )}
              </button>
            ))}
        </div>
      )}
      <div className="grid gap-2">
        {!loading && query.length > 0 && results.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Inga resultat hittades</p>
        )}
        {!loading && query.length > 0 && results.length > 0 && filteredResults.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Inga resultat i denna kategori</p>
        )}
        {filteredResults.map((stock) => (
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
                <div className="flex items-center gap-1.5">
                  <p className="font-mono font-semibold text-sm">{stock.ticker}</p>
                  {classifyResult(stock) !== "EQUITY" && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {classifyResult(stock) === "ETF" ? "ETF" :
                       classifyResult(stock) === "CRYPTOCURRENCY" ? "Krypto" :
                       classifyResult(stock) === "CERTIFICATE" ? "Certifikat" : ""}
                    </span>
                  )}
                </div>
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
