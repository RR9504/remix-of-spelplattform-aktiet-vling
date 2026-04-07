import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, Clock } from "lucide-react";
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

export function TradeDialog({ stock, priceData: initialPriceData, onClose }: TradeDialogProps) {
  const { activeCompetition, activeTeam, cashBalance, marginReserved, refresh } = useCompetition();
  const rules = (activeCompetition as any)?.rules || {};
  const shortsAllowed = rules.allow_shorts !== false;
  const mktFilter = rules.market_filter || "all";

  // Determine asset type and market
  const isCrypto = stock.ticker.includes("-USD") || stock.ticker.includes("-EUR") || stock.ticker.includes("-GBP");
  const isCommodity = stock.ticker.endsWith("=F");
  const isSE = stock.exchange?.includes("Stockholm") || stock.ticker.endsWith(".ST");
  const isDK = stock.exchange?.includes("Copenhagen") || stock.ticker.endsWith(".CO");
  const isSETicker = isSE;
  const isDKTicker = isDK;
  const assetMarket: "SE" | "DK" | "US" | "CRYPTO" = isCrypto ? "CRYPTO" : (isSE ? "SE" : (isDK ? "DK" : "US"));
  const marketOpen = isMarketOpen(assetMarket);
  const marketBlocked = (mktFilter === "SE" && !isSETicker) || (mktFilter === "US" && (isSETicker || isDKTicker || isCrypto || isCommodity));

  const [shares, setShares] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [loading, setLoading] = useState(false);
  const [priceData, setPriceData] = useState<StockPrice | null>(initialPriceData);
  const [fetchingPrice, setFetchingPrice] = useState(false);

  // Short selling state
  const [shortSide, setShortSide] = useState<"short" | "cover">("short");

  // Current holding state
  const [currentShares, setCurrentShares] = useState<number>(0);
  const [avgCost, setAvgCost] = useState<number>(0);
  const [shortShares, setShortShares] = useState<number>(0);
  const [shortEntryPrice, setShortEntryPrice] = useState<number>(0);

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
      .select("shares, entry_price_sek")
      .eq("competition_id", activeCompetition.id)
      .eq("team_id", activeTeam.id)
      .eq("ticker", stock.ticker)
      .is("closed_at", null)
      .then(({ data }) => {
        const positions = data || [];
        setShortShares(positions.reduce((sum, s) => sum + Number(s.shares), 0));
        setShortEntryPrice(positions.length > 0 ? Number(positions[0].entry_price_sek) : 0);
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
  const availableCash = (cashBalance ?? 0) - (marginReserved ?? 0);
  const maxShares = side === "buy" && availableCash > 0 && price > 0
    ? Math.floor(availableCash / (price * exchangeRate))
    : 0;

  // Place a market order (queued for next open)
  const placeMarketOrder = async (orderType: OrderType) => {
    if (!activeCompetition || !activeTeam) return;
    setLoading(true);
    const result = await placeOrder({
      competition_id: activeCompetition.id,
      team_id: activeTeam.id,
      ticker: stock.ticker,
      stock_name: priceData?.stock_name || stock.name,
      order_type: orderType,
      shares: qty,
      currency: currency,
    });

    if (result.success) {
      const labels: Record<string, string> = {
        market_buy: "Köporder",
        market_sell: "Säljorder",
        market_short: "Blankningsorder",
        market_cover: "Täckningsorder",
      };
      toast.success(`${labels[orderType]} skapad för ${qty} st ${stock.ticker} — utförs vid börsöppning`);
      await refresh();
      onClose();
    } else {
      toast.error(result.error || "Kunde inte skapa order");
    }
    setLoading(false);
  };

  const handleTrade = async () => {
    if (!activeCompetition || !activeTeam) {
      toast.error("Välj en aktiv tävling och ett lag först");
      return;
    }
    if (qty <= 0) {
      toast.error("Ange antal");
      return;
    }

    // Market closed → place market order instead
    if (!marketOpen) {
      await placeMarketOrder(side === "buy" ? "market_buy" : "market_sell");
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
      toast.error("Ange antal");
      return;
    }

    // Market closed → place market order instead
    if (!marketOpen) {
      await placeMarketOrder(shortSide === "short" ? "market_short" : "market_cover");
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

  // Place SL/TP order (works for both longs and shorts)
  const handlePlaceProtection = async (type: "stop_loss" | "take_profit", targetPriceSek: number, protectShares: number, forShort: boolean) => {
    if (!activeCompetition || !activeTeam) return;

    const result = await placeOrder({
      competition_id: activeCompetition.id,
      team_id: activeTeam.id,
      ticker: stock.ticker,
      stock_name: priceData?.stock_name || stock.name,
      order_type: type,
      target_price: targetPriceSek,
      shares: protectShares,
      currency: currency,
      for_short: forShort,
    });

    if (result.success) {
      toast.success(`${type === "stop_loss" ? "Stop-Loss" : "Take-Profit"} satt för ${stock.ticker}`);
      await refresh();
    } else {
      toast.error(result.error || "Kunde inte skapa skyddsordern");
    }
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

  const renderMarketClosedBanner = () => {
    if (marketOpen) return null;
    return (
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm flex items-start gap-2">
        <Clock className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-yellow-600">Marknaden är stängd</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Din order läggs och utförs automatiskt vid nästa börsöppning.
          </p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 min-w-0">
            <span>{isCrypto ? "🪙" : isCommodity ? "📦" : isSE ? "🇸🇪" : "🇺🇸"}</span>
            <span className="font-mono shrink-0">{stock.ticker}</span>
            <span className="text-muted-foreground font-normal text-sm truncate">
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
          ) : marketBlocked ? (
            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-4 text-center">
              <p className="font-medium text-yellow-600">
                {mktFilter === "SE" ? "Bara svenska aktier tillåtna" : "Bara amerikanska aktier tillåtna"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Denna tävling har ett marknadsfilter som inte tillåter handel i {stock.ticker}.
              </p>
            </div>
          ) : (
            <Tabs defaultValue="direct">
              <TabsList className="w-full">
                <TabsTrigger value="direct" className="flex-1 text-xs sm:text-sm">
                  {marketOpen ? "Direkt" : "Köp / Sälj"}
                </TabsTrigger>
                {shortsAllowed && (
                  <TabsTrigger value="short" className="flex-1 text-xs sm:text-sm">Blankning</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="direct" className="space-y-4 mt-4">
                {renderMarketClosedBanner()}

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
                        <span className="text-muted-foreground">{isCrypto ? "Enheter" : isCommodity ? "Kontrakt" : "Aktier"}</span>
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
                    <span className="font-mono font-semibold">{formatSEK(availableCash)}</span>
                    {side === "buy" && maxShares > 0 && (
                      <span className="text-muted-foreground"> (max {maxShares} st)</span>
                    )}
                    {side === "sell" && currentShares > 0 && (
                      <span className="text-muted-foreground"> (max {currentShares} st att sälja)</span>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-sm text-muted-foreground">Antal</label>
                  <Input
                    type="number"
                    min={1}
                    max={100000}
                    placeholder="0"
                    value={shares}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || (Number(v) >= 0 && Number(v) <= 100000)) setShares(v);
                    }}
                    className="font-mono"
                  />
                </div>

                {qty > 0 && priceData && (
                  <div className="rounded-lg bg-surface p-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {!marketOpen ? "Uppskattat värde" : "Total kostnad"}
                      </span>
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
                    {!marketOpen && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Slutpriset bestäms vid börsöppning
                      </p>
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
                  ) : !marketOpen ? (
                    <Clock className="h-4 w-4 mr-2" />
                  ) : null}
                  {loading
                    ? "Genomför..."
                    : !marketOpen
                    ? `Lägg ${side === "buy" ? "köp" : "sälj"}order`
                    : `${side === "buy" ? "Köp" : "Sälj"} ${stock.ticker}`}
                </Button>
              </TabsContent>

              <TabsContent value="short" className="space-y-4 mt-4">
                {renderMarketClosedBanner()}

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
                  <div className="rounded-lg border bg-surface p-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Öppen blankningsposition</span>
                      <span className="font-mono font-semibold">{shortShares.toLocaleString("sv-SE")} st</span>
                    </div>
                    {shortEntryPrice > 0 && priceData && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">P&L</span>
                        <span className={`font-mono font-semibold ${
                          shortEntryPrice > priceData.price_sek ? "text-gain" : "text-loss"
                        }`}>
                          {shortEntryPrice > priceData.price_sek ? "+" : ""}
                          {formatSEK((shortEntryPrice - priceData.price_sek) * shortShares)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {cashBalance !== null && shortSide === "short" && priceData && (
                  <div className="text-sm space-y-1">
                    <div>
                      <span className="text-muted-foreground">Tillgängligt: </span>
                      <span className="font-mono font-semibold">{formatSEK(availableCash)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Marginal: 150% av blankvärdet reserveras
                    </p>
                  </div>
                )}

                <div>
                  <label className="text-sm text-muted-foreground">Antal</label>
                  <Input
                    type="number"
                    min={1}
                    max={100000}
                    placeholder="0"
                    value={shares}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || (Number(v) >= 0 && Number(v) <= 100000)) setShares(v);
                    }}
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
                    {!marketOpen && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Slutpriset bestäms vid börsöppning
                      </p>
                    )}
                  </div>
                )}

                <Button
                  onClick={handleShortTrade}
                  className="w-full"
                  disabled={!priceData || qty <= 0 || loading || fetchingPrice}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : !marketOpen ? (
                    <Clock className="h-4 w-4 mr-2" />
                  ) : null}
                  {loading
                    ? "Genomför..."
                    : !marketOpen
                    ? `Lägg ${shortSide === "short" ? "blanknings" : "täcknings"}order`
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
