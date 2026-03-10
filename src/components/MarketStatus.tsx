import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { isMarketOpen, formatSEK } from "@/lib/mockData";
import { NASDAQ_STOCKHOLM, US_POPULAR, type IndexStock } from "@/data/exchangeStocks";

interface PriceInfo {
  price_sek: number;
  change_percent: number | null;
}

export function MarketStatus() {
  const seOpen = isMarketOpen("SE");
  const usOpen = isMarketOpen("US");
  const [openMarket, setOpenMarket] = useState<"SE" | "US" | null>(null);

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2">
        <StatusBadge label="Nasdaq Stockholm" open={seOpen} hours="09:00–17:30" flag="🇸🇪" onClick={() => setOpenMarket("SE")} />
        <StatusBadge label="NYSE/NASDAQ" open={usOpen} hours="15:30–22:00" flag="🇺🇸" onClick={() => setOpenMarket("US")} />
      </div>
      {openMarket && (
        <IndexDialog market={openMarket} onClose={() => setOpenMarket(null)} />
      )}
    </>
  );
}

function StatusBadge({ label, open, hours, flag, onClick }: { label: string; open: boolean; hours: string; flag: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 sm:px-4 sm:py-3 text-left transition-colors hover:bg-muted/50"
    >
      <span className="text-lg">{flag}</span>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${open ? "bg-gain animate-pulse-glow" : "bg-muted-foreground/50"}`} />
          <span className="text-xs text-muted-foreground">
            {open ? "Öppen" : "Stängd"} · {hours}
          </span>
        </div>
      </div>
    </button>
  );
}

function IndexDialog({ market, onClose }: { market: "SE" | "US"; onClose: () => void }) {
  const navigate = useNavigate();
  const baseStocks = market === "SE" ? NASDAQ_STOCKHOLM : US_POPULAR;
  const title = market === "SE" ? "Nasdaq Stockholm" : "Populära US-aktier";
  const subtitle = market === "SE" ? `Large Cap + Mid Cap · ${baseStocks.length} aktier` : `${baseStocks.length} aktier`;

  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [extraStocks, setExtraStocks] = useState<IndexStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      if (market === "SE") {
        // Fetch ALL .ST tickers from cache — picks up stocks users have discovered
        const { data: cacheRows } = await supabase
          .from("stock_price_cache")
          .select("ticker, price_sek, change_percent, stock_name")
          .like("ticker", "%.ST");

        const priceMap: Record<string, PriceInfo> = {};
        const knownTickers = new Set(baseStocks.map((s) => s.ticker));
        const extras: IndexStock[] = [];

        for (const row of cacheRows || []) {
          priceMap[row.ticker] = {
            price_sek: Number(row.price_sek),
            change_percent: row.change_percent != null ? Number(row.change_percent) : null,
          };
          if (!knownTickers.has(row.ticker) && row.stock_name) {
            extras.push({ ticker: row.ticker, name: row.stock_name });
          }
        }

        setPrices(priceMap);
        setExtraStocks(extras.sort((a, b) => a.name.localeCompare(b.name, "sv")));
      } else {
        // US stocks — fetch prices for the hardcoded list
        const tickers = baseStocks.map((s) => s.ticker);
        const { data } = await supabase
          .from("stock_price_cache")
          .select("ticker, price_sek, change_percent")
          .in("ticker", tickers);

        const priceMap: Record<string, PriceInfo> = {};
        for (const row of data || []) {
          priceMap[row.ticker] = {
            price_sek: Number(row.price_sek),
            change_percent: row.change_percent != null ? Number(row.change_percent) : null,
          };
        }
        setPrices(priceMap);
      }
      setLoading(false);
    };
    load();
  }, [market]);

  const allStocks = useMemo(() => {
    const combined = [...baseStocks, ...extraStocks];
    // Deduplicate by ticker
    const seen = new Set<string>();
    return combined.filter((s) => {
      if (seen.has(s.ticker)) return false;
      seen.add(s.ticker);
      return true;
    });
  }, [baseStocks, extraStocks]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allStocks;
    const q = search.toLowerCase();
    return allStocks.filter(
      (s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
  }, [allStocks, search]);

  const handleClick = (ticker: string) => {
    onClose();
    navigate(`/stock/${encodeURIComponent(ticker)}`);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Sök aktie..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
            autoFocus
          />
        </div>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Inga aktier matchar sökningen</p>
        ) : (
          <div className="overflow-y-auto -mx-1 px-1 space-y-0.5 min-h-0">
            {filtered.map((stock) => {
              const price = prices[stock.ticker];
              const changePositive = (price?.change_percent ?? 0) >= 0;
              return (
                <button
                  key={stock.ticker}
                  onClick={() => handleClick(stock.ticker)}
                  className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-sm">{stock.ticker.replace(".ST", "")}</p>
                    <p className="text-xs text-muted-foreground truncate">{stock.name}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    {price ? (
                      <>
                        <p className="font-mono text-sm">{formatSEK(price.price_sek)}</p>
                        {price.change_percent != null && (
                          <p className={`font-mono text-xs font-medium ${changePositive ? "text-gain" : "text-loss"}`}>
                            {changePositive ? "+" : ""}{price.change_percent.toFixed(2)}%
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">–</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
