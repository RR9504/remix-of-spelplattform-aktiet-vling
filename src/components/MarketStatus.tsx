import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { isMarketOpen } from "@/lib/mockData";
import { formatSEK } from "@/lib/mockData";

interface IndexStock {
  ticker: string;
  name: string;
}

const OMXS30: IndexStock[] = [
  { ticker: "ABB.ST", name: "ABB" },
  { ticker: "ALFA.ST", name: "Alfa Laval" },
  { ticker: "ASSA-B.ST", name: "Assa Abloy B" },
  { ticker: "ATCO-A.ST", name: "Atlas Copco A" },
  { ticker: "ATCO-B.ST", name: "Atlas Copco B" },
  { ticker: "AZN.ST", name: "AstraZeneca" },
  { ticker: "BOL.ST", name: "Boliden" },
  { ticker: "EQT.ST", name: "EQT" },
  { ticker: "ERIC-B.ST", name: "Ericsson B" },
  { ticker: "ESSITY-B.ST", name: "Essity B" },
  { ticker: "EVO.ST", name: "Evolution" },
  { ticker: "GETI-B.ST", name: "Getinge B" },
  { ticker: "HEXA-B.ST", name: "Hexagon B" },
  { ticker: "HM-B.ST", name: "H&M B" },
  { ticker: "INVE-B.ST", name: "Investor B" },
  { ticker: "KINV-B.ST", name: "Kinnevik B" },
  { ticker: "NDA-SE.ST", name: "Nordea" },
  { ticker: "NIBE-B.ST", name: "Nibe Industrier B" },
  { ticker: "SAND.ST", name: "Sandvik" },
  { ticker: "SCA-B.ST", name: "SCA B" },
  { ticker: "SEB-A.ST", name: "SEB A" },
  { ticker: "SHB-A.ST", name: "Handelsbanken A" },
  { ticker: "SINCH.ST", name: "Sinch" },
  { ticker: "SKA-B.ST", name: "Skanska B" },
  { ticker: "SKF-B.ST", name: "SKF B" },
  { ticker: "SSAB-A.ST", name: "SSAB A" },
  { ticker: "SWED-A.ST", name: "Swedbank A" },
  { ticker: "TEL2-B.ST", name: "Tele2 B" },
  { ticker: "TELIA.ST", name: "Telia" },
  { ticker: "VOLV-B.ST", name: "Volvo B" },
];

const US_POPULAR: IndexStock[] = [
  { ticker: "AAPL", name: "Apple" },
  { ticker: "AMZN", name: "Amazon" },
  { ticker: "GOOGL", name: "Alphabet (Google)" },
  { ticker: "META", name: "Meta Platforms" },
  { ticker: "MSFT", name: "Microsoft" },
  { ticker: "NVDA", name: "NVIDIA" },
  { ticker: "TSLA", name: "Tesla" },
  { ticker: "AMD", name: "AMD" },
  { ticker: "NFLX", name: "Netflix" },
  { ticker: "DIS", name: "Walt Disney" },
  { ticker: "JPM", name: "JPMorgan Chase" },
  { ticker: "V", name: "Visa" },
  { ticker: "MA", name: "Mastercard" },
  { ticker: "JNJ", name: "Johnson & Johnson" },
  { ticker: "PG", name: "Procter & Gamble" },
  { ticker: "UNH", name: "UnitedHealth" },
  { ticker: "HD", name: "Home Depot" },
  { ticker: "KO", name: "Coca-Cola" },
  { ticker: "PEP", name: "PepsiCo" },
  { ticker: "COST", name: "Costco" },
  { ticker: "ABBV", name: "AbbVie" },
  { ticker: "CRM", name: "Salesforce" },
  { ticker: "MCD", name: "McDonald's" },
  { ticker: "NKE", name: "Nike" },
  { ticker: "BA", name: "Boeing" },
  { ticker: "INTC", name: "Intel" },
  { ticker: "PYPL", name: "PayPal" },
  { ticker: "UBER", name: "Uber" },
  { ticker: "COIN", name: "Coinbase" },
  { ticker: "SPOT", name: "Spotify" },
];

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
        <IndexDialog
          market={openMarket}
          onClose={() => setOpenMarket(null)}
        />
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
  const stocks = market === "SE" ? OMXS30 : US_POPULAR;
  const title = market === "SE" ? "OMXS30" : "Populära US-aktier";
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tickers = stocks.map((s) => s.ticker);
    supabase
      .from("stock_price_cache")
      .select("ticker, price_sek, change_percent")
      .in("ticker", tickers)
      .then(({ data }) => {
        const map: Record<string, PriceInfo> = {};
        for (const row of data || []) {
          map[row.ticker] = {
            price_sek: Number(row.price_sek),
            change_percent: row.change_percent != null ? Number(row.change_percent) : null,
          };
        }
        setPrices(map);
        setLoading(false);
      });
  }, [market]);

  const handleClick = (ticker: string) => {
    onClose();
    navigate(`/stock/${encodeURIComponent(ticker)}`);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-y-auto -mx-1 px-1 space-y-1">
            {stocks.map((stock) => {
              const price = prices[stock.ticker];
              const changePositive = (price?.change_percent ?? 0) >= 0;
              return (
                <button
                  key={stock.ticker}
                  onClick={() => handleClick(stock.ticker)}
                  className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
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
