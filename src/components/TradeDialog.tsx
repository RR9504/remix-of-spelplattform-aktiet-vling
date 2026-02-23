import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { executeTrade, fetchStockPrice } from "@/lib/api";
import { useCompetition } from "@/contexts/CompetitionContext";
import { formatSEK, formatPrice } from "@/lib/mockData";
import type { StockSearchResult, StockPrice } from "@/types/trading";

interface TradeDialogProps {
  stock: StockSearchResult;
  priceData: StockPrice | null;
  onClose: () => void;
}

export function TradeDialog({ stock, priceData: initialPriceData, onClose }: TradeDialogProps) {
  const { activeCompetition, activeTeam, cashBalance, refresh } = useCompetition();
  const [shares, setShares] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [loading, setLoading] = useState(false);
  const [priceData, setPriceData] = useState<StockPrice | null>(initialPriceData);
  const [fetchingPrice, setFetchingPrice] = useState(false);

  // Try to fetch price if we don't have it
  useEffect(() => {
    if (!priceData) {
      retryFetchPrice();
    }
  }, []);

  const retryFetchPrice = async () => {
    setFetchingPrice(true);
    const data = await fetchStockPrice(stock.ticker);
    if (data) setPriceData(data);
    setFetchingPrice(false);
  };

  const qty = parseInt(shares) || 0;
  const price = priceData?.price ?? 0;
  const exchangeRate = priceData?.exchange_rate ?? 1;
  const currency = priceData?.currency ?? stock.currency ?? "SEK";
  const costInCurrency = qty * price;
  const costSEK = costInCurrency * exchangeRate;
  const maxShares = side === "buy" && cashBalance && price > 0
    ? Math.floor(cashBalance / (price * exchangeRate))
    : 0;

  const handleTrade = async () => {
    if (!activeCompetition || !activeTeam) {
      toast.error("Välj en aktiv tävling och ett lag först");
      return;
    }
    if (qty <= 0) {
      toast.error("Ange antal aktier");
      return;
    }

    setLoading(true);
    const result = await executeTrade({
      competition_id: activeCompetition.id,
      team_id: activeTeam.id,
      ticker: stock.ticker,
      side,
      shares: qty,
    });

    if (result.success) {
      toast.success(
        `${side === "buy" ? "Köpt" : "Sålt"} ${qty} st ${stock.ticker} för ${formatSEK(costSEK)}`
      );
      await refresh();
      onClose();
    } else {
      toast.error(result.error || "Handeln misslyckades");
    }
    setLoading(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{stock.exchange?.includes("Stockholm") || stock.ticker.endsWith(".ST") ? "🇸🇪" : "🇺🇸"}</span>
            <span className="font-mono">{stock.ticker}</span>
            <span className="text-muted-foreground font-normal text-sm">
              – {priceData?.stock_name || stock.name}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!activeCompetition || !activeTeam ? (
            <div className="rounded-lg bg-muted p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Du behöver gå med i en tävling med ditt lag innan du kan handla.
              </p>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Button
                  variant={side === "buy" ? "default" : "outline"}
                  className={side === "buy" ? "flex-1 bg-gain hover:bg-gain/90" : "flex-1"}
                  onClick={() => setSide("buy")}
                >
                  Köp
                </Button>
                <Button
                  variant={side === "sell" ? "default" : "outline"}
                  className={side === "sell" ? "flex-1 bg-loss hover:bg-loss/90" : "flex-1"}
                  onClick={() => setSide("sell")}
                >
                  Sälj
                </Button>
              </div>

              <div>
                <label className="text-sm text-muted-foreground">Kurs</label>
                {priceData ? (
                  <>
                    <p className="font-mono text-lg font-semibold">
                      {formatPrice(price, currency as "SEK" | "USD")}
                    </p>
                    {currency !== "SEK" && (
                      <p className="text-xs text-muted-foreground">
                        ≈ {formatSEK(price * exchangeRate)} · Växelkurs: 1 {currency} = {exchangeRate.toFixed(2)} SEK
                      </p>
                    )}
                    {priceData.stale && (
                      <p className="text-xs text-yellow-500">Senast kända pris (marknaden kan vara stängd)</p>
                    )}
                  </>
                ) : fetchingPrice ? (
                  <div className="flex items-center gap-2 py-1">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Hämtar kurs...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 py-1">
                    <span className="text-sm text-muted-foreground">Kunde inte hämta pris</span>
                    <Button variant="ghost" size="sm" onClick={retryFetchPrice}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Försök igen
                    </Button>
                  </div>
                )}
              </div>

              {cashBalance !== null && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Tillgängligt: </span>
                  <span className="font-mono font-semibold">{formatSEK(cashBalance)}</span>
                  {side === "buy" && maxShares > 0 && (
                    <span className="text-muted-foreground"> (max {maxShares} st)</span>
                  )}
                </div>
              )}

              <div>
                <label className="text-sm text-muted-foreground">Antal aktier</label>
                <Input
                  type="number"
                  min={1}
                  placeholder="0"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  className="font-mono"
                />
              </div>

              {qty > 0 && priceData && (
                <div className="rounded-lg bg-surface p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total kostnad</span>
                    <span className="font-mono font-semibold">{formatSEK(costSEK)}</span>
                  </div>
                  {currency !== "SEK" && (
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>I {currency}</span>
                      <span className="font-mono">
                        {formatPrice(costInCurrency, currency as "SEK" | "USD")}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={handleTrade}
                className="w-full"
                disabled={!priceData || qty <= 0 || loading || fetchingPrice}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {loading
                  ? "Genomför..."
                  : `${side === "buy" ? "Köp" : "Sälj"} ${stock.ticker}`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
