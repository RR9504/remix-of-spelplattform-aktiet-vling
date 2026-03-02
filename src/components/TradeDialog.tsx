import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { executeTrade, fetchStockPrice, placeOrder } from "@/lib/api";
import { useCompetition } from "@/contexts/CompetitionContext";
import { supabase } from "@/integrations/supabase/client";
import { formatSEK, formatPrice, isMarketOpen } from "@/lib/mockData";
import type { StockSearchResult, StockPrice, OrderType } from "@/types/trading";

interface TradeDialogProps {
  stock: StockSearchResult;
  priceData: StockPrice | null;
  onClose: () => void;
}

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  limit_buy: "Limitköp",
  limit_sell: "Limitsälj",
  stop_loss: "Stop-Loss",
  take_profit: "Take-Profit",
};

export function TradeDialog({ stock, priceData: initialPriceData, onClose }: TradeDialogProps) {
  const { activeCompetition, activeTeam, cashBalance, refresh } = useCompetition();
  const [shares, setShares] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [loading, setLoading] = useState(false);
  const [priceData, setPriceData] = useState<StockPrice | null>(initialPriceData);
  const [fetchingPrice, setFetchingPrice] = useState(false);

  // Limit order state
  const [orderType, setOrderType] = useState<OrderType>("limit_buy");
  const [targetPrice, setTargetPrice] = useState("");
  const [limitShares, setLimitShares] = useState("");
  const [placingOrder, setPlacingOrder] = useState(false);

  // Short selling state
  const [shortSide, setShortSide] = useState<"short" | "cover">("short");

  // Current holding state
  const [currentShares, setCurrentShares] = useState<number>(0);
  const [avgCost, setAvgCost] = useState<number>(0);
  const [shortShares, setShortShares] = useState<number>(0);

  // Determine which market this stock belongs to and if it's open
  const isSE = stock.exchange?.includes("Stockholm") || stock.ticker.endsWith(".ST");
  const marketOpen = isMarketOpen(isSE ? "SE" : "US");

  useEffect(() => {
    if (!priceData) {
      retryFetchPrice();
    }
  }, []);

  // Fetch current holding for this ticker
  useEffect(() => {
    if (!activeCompetition || !activeTeam) return;
    supabase
      .from("team_holdings")
      .select("total_shares, avg_cost_per_share_sek")
      .eq("competition_id", activeCompetition.id)
      .eq("team_id", activeTeam.id)
      .eq("ticker", stock.ticker)
      .maybeSingle()
      .then(({ data }) => {
        setCurrentShares(data ? Number(data.total_shares) : 0);
        setAvgCost(data ? Number(data.avg_cost_per_share_sek) : 0);
      });
    supabase
      .from("short_positions")
      .select("shares")
      .eq("competition_id", activeCompetition.id)
      .eq("team_id", activeTeam.id)
      .eq("ticker", stock.ticker)
      .is("closed_at", null)
      .then(({ data }) => {
        setShortShares((data || []).reduce((sum, s) => sum + Number(s.shares), 0));
      });
  }, [activeCompetition?.id, activeTeam?.id, stock.ticker]);

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

  const handleShortTrade = async () => {
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
      side: shortSide,
      shares: qty,
    });

    if (result.success) {
      toast.success(
        `${shortSide === "short" ? "Blankat" : "Täckt"} ${qty} st ${stock.ticker}`
      );
      await refresh();
      onClose();
    } else {
      toast.error(result.error || "Handeln misslyckades");
    }
    setLoading(false);
  };

  const handlePlaceOrder = async () => {
    if (!activeCompetition || !activeTeam) {
      toast.error("Välj en aktiv tävling och ett lag först");
      return;
    }
    const lQty = parseInt(limitShares) || 0;
    const lPrice = parseFloat(targetPrice) || 0;
    if (lQty <= 0 || lPrice <= 0) {
      toast.error("Ange riktkurs och antal aktier");
      return;
    }

    setPlacingOrder(true);
    const result = await placeOrder({
      competition_id: activeCompetition.id,
      team_id: activeTeam.id,
      ticker: stock.ticker,
      stock_name: priceData?.stock_name || stock.name,
      order_type: orderType,
      target_price: lPrice,
      shares: lQty,
      currency: currency,
    });

    if (result.success) {
      toast.success(`${ORDER_TYPE_LABELS[orderType]} skapad för ${stock.ticker}`);
      await refresh();
      onClose();
    } else {
      toast.error(result.error || "Kunde inte skapa order");
    }
    setPlacingOrder(false);
  };

  const renderPriceInfo = () => (
    <div>
      <label className="text-sm text-muted-foreground">Kurs</label>
      {priceData ? (
        <>
          <p className="font-mono text-lg font-semibold">
            {formatPrice(price, currency)}
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
  );

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
            <Tabs defaultValue={marketOpen ? "direct" : "limit"}>
              <TabsList className="w-full">
                <TabsTrigger value="direct" className="flex-1 text-xs sm:text-sm">Direkt</TabsTrigger>
                <TabsTrigger value="limit" className="flex-1 text-xs sm:text-sm">Limitorder</TabsTrigger>
                <TabsTrigger value="short" className="flex-1 text-xs sm:text-sm">Blankning</TabsTrigger>
              </TabsList>

              <TabsContent value="direct" className="space-y-4 mt-4">
                {!marketOpen && (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm">
                    <p className="font-medium text-yellow-600">Börsen är stängd</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Direkthandel är inte tillgängligt just nu. Använd <strong>Limitorder</strong> för att lägga en order som exekveras vid nästa börsöppning.
                    </p>
                  </div>
                )}
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

                {renderPriceInfo()}

                {(currentShares > 0 || shortShares > 0) && (
                  <div className="rounded-lg border bg-surface p-3 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ditt innehav</p>
                    {currentShares > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Aktier</span>
                        <span className="font-mono font-semibold">{currentShares.toLocaleString("sv-SE")} st</span>
                      </div>
                    )}
                    {currentShares > 0 && avgCost > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">GAV</span>
                        <span className="font-mono">{formatSEK(avgCost)}</span>
                      </div>
                    )}
                    {currentShares > 0 && priceData && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Marknadsvärde</span>
                        <span className="font-mono">{formatSEK(currentShares * priceData.price_sek)}</span>
                      </div>
                    )}
                    {currentShares > 0 && avgCost > 0 && priceData && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Avkastning</span>
                        <span className={`font-mono font-semibold ${priceData.price_sek >= avgCost ? "text-gain" : "text-loss"}`}>
                          {priceData.price_sek >= avgCost ? "+" : ""}{formatSEK((priceData.price_sek - avgCost) * currentShares)}
                          {" "}({((priceData.price_sek - avgCost) / avgCost * 100).toFixed(1)}%)
                        </span>
                      </div>
                    )}
                    {shortShares > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Blankat</span>
                        <span className="font-mono font-semibold text-loss">{shortShares.toLocaleString("sv-SE")} st</span>
                      </div>
                    )}
                  </div>
                )}

                {cashBalance !== null && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Tillgängligt: </span>
                    <span className="font-mono font-semibold">{formatSEK(cashBalance)}</span>
                    {side === "buy" && maxShares > 0 && (
                      <span className="text-muted-foreground"> (max {maxShares} st)</span>
                    )}
                    {side === "sell" && currentShares > 0 && (
                      <span className="text-muted-foreground"> (max {currentShares} st att sälja)</span>
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
                          {formatPrice(costInCurrency, currency)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  onClick={handleTrade}
                  className="w-full"
                  disabled={!priceData || qty <= 0 || loading || fetchingPrice || !marketOpen}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {!marketOpen
                    ? "Börsen stängd — använd limitorder"
                    : loading
                    ? "Genomför..."
                    : `${side === "buy" ? "Köp" : "Sälj"} ${stock.ticker}`}
                </Button>
              </TabsContent>

              <TabsContent value="limit" className="space-y-4 mt-4">
                <div>
                  <label className="text-sm text-muted-foreground">Ordertyp</label>
                  <Select value={orderType} onValueChange={(v) => setOrderType(v as OrderType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="limit_buy">Limitköp</SelectItem>
                      <SelectItem value="limit_sell">Limitsälj</SelectItem>
                      <SelectItem value="stop_loss">Stop-Loss</SelectItem>
                      <SelectItem value="take_profit">Take-Profit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {renderPriceInfo()}

                <div>
                  <label className="text-sm text-muted-foreground">
                    Riktkurs (SEK)
                  </label>
                  <Input
                    type="number"
                    min={0.01}
                    step="0.01"
                    placeholder="0.00"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    className="font-mono"
                  />
                  {priceData && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Nuvarande kurs i SEK: {formatSEK(priceData.price_sek)}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm text-muted-foreground">Antal aktier</label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="0"
                    value={limitShares}
                    onChange={(e) => setLimitShares(e.target.value)}
                    className="font-mono"
                  />
                </div>

                {(parseFloat(targetPrice) || 0) > 0 && (parseInt(limitShares) || 0) > 0 && (
                  <div className="rounded-lg bg-surface p-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Ordertyp</span>
                      <span className="font-semibold">{ORDER_TYPE_LABELS[orderType]}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Riktkurs</span>
                      <span className="font-mono">{formatSEK(parseFloat(targetPrice))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Antal</span>
                      <span className="font-mono">{parseInt(limitShares)} st</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Uppskattat värde</span>
                      <span className="font-mono font-semibold">
                        {formatSEK(parseFloat(targetPrice) * parseInt(limitShares))}
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handlePlaceOrder}
                  className="w-full"
                  disabled={
                    !priceData ||
                    (parseInt(limitShares) || 0) <= 0 ||
                    (parseFloat(targetPrice) || 0) <= 0 ||
                    placingOrder ||
                    fetchingPrice
                  }
                >
                  {placingOrder ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {placingOrder ? "Skapar order..." : "Lägg order"}
                </Button>
              </TabsContent>

              <TabsContent value="short" className="space-y-4 mt-4">
                {!marketOpen && (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm">
                    <p className="font-medium text-yellow-600">Börsen är stängd</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Blankning kräver att börsen är öppen. Använd <strong>Limitorder</strong> istället.
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant={shortSide === "short" ? "default" : "outline"}
                    className={shortSide === "short" ? "flex-1 bg-loss hover:bg-loss/90" : "flex-1"}
                    onClick={() => setShortSide("short")}
                  >
                    Blanka
                  </Button>
                  <Button
                    variant={shortSide === "cover" ? "default" : "outline"}
                    className={shortSide === "cover" ? "flex-1 bg-gain hover:bg-gain/90" : "flex-1"}
                    onClick={() => setShortSide("cover")}
                  >
                    Täck
                  </Button>
                </div>

                {renderPriceInfo()}

                {shortShares > 0 && (
                  <div className="rounded-lg border bg-surface p-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Öppen blankningsposition</span>
                      <span className="font-mono font-semibold">{shortShares.toLocaleString("sv-SE")} st</span>
                    </div>
                  </div>
                )}

                {cashBalance !== null && shortSide === "short" && priceData && (
                  <div className="text-sm space-y-1">
                    <div>
                      <span className="text-muted-foreground">Tillgängligt: </span>
                      <span className="font-mono font-semibold">{formatSEK(cashBalance)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Marginal: 150% av blankvärdet reserveras
                    </p>
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

                {qty > 0 && priceData && shortSide === "short" && (
                  <div className="rounded-lg bg-surface p-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Blankvärde</span>
                      <span className="font-mono">{formatSEK(costSEK)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Marginal (150%)</span>
                      <span className="font-mono font-semibold">{formatSEK(costSEK * 1.5)}</span>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleShortTrade}
                  className="w-full"
                  disabled={!priceData || qty <= 0 || loading || fetchingPrice || !marketOpen}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {!marketOpen
                    ? "Börsen stängd — använd limitorder"
                    : loading
                    ? "Genomför..."
                    : `${shortSide === "short" ? "Blanka" : "Täck"} ${stock.ticker}`}
                </Button>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
