import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Landmark, Shield, Target, Loader2, X } from "lucide-react";
import { formatSEK } from "@/lib/mockData";
import { placeOrder, getOrders } from "@/lib/api";
import { useCompetition } from "@/contexts/CompetitionContext";
import { toast } from "sonner";
import type { Holding, ShortPosition, PendingOrder } from "@/types/trading";

interface HoldingsTableProps {
  holdings: Holding[];
  shortPositions?: ShortPosition[];
  totalValue?: number;
  savingsBalance?: number;
}

function ProtectionButtons({ ticker, stockName, shares, currentPriceSek, forShort, currency, pendingOrders = [] }: {
  ticker: string;
  stockName: string;
  shares: number;
  currentPriceSek?: number;
  forShort: boolean;
  currency: string;
  pendingOrders?: PendingOrder[];
}) {
  const { activeCompetition, activeTeam, refresh } = useCompetition();
  const [showForm, setShowForm] = useState<"stop_loss" | "take_profit" | null>(null);
  const [targetPrice, setTargetPrice] = useState("");
  const [protectShares, setProtectShares] = useState(String(shares));
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!activeCompetition || !activeTeam || !showForm) return;
    const tp = parseFloat(targetPrice);
    const qty = parseInt(protectShares);
    if (!tp || tp <= 0 || !qty || qty <= 0) {
      toast.error("Ange giltigt pris och antal");
      return;
    }
    if (qty > shares) {
      toast.error(`Max ${shares} st`);
      return;
    }

    setLoading(true);
    const result = await placeOrder({
      competition_id: activeCompetition.id,
      team_id: activeTeam.id,
      ticker,
      stock_name: stockName,
      order_type: showForm,
      target_price: tp,
      shares: qty,
      currency,
      for_short: forShort,
    });

    if (result.success) {
      toast.success(`${showForm === "stop_loss" ? "Stop-Loss" : "Take-Profit"} satt för ${ticker}`);
      setShowForm(null);
      setTargetPrice("");
      await refresh();
    } else {
      toast.error(result.error || "Kunde inte skapa order");
    }
    setLoading(false);
  };

  if (showForm) {
    const label = showForm === "stop_loss" ? "Stop-Loss" : "Take-Profit";
    const hint = forShort
      ? (showForm === "stop_loss" ? "Täcks om kursen stiger över" : "Täcks om kursen sjunker under")
      : (showForm === "stop_loss" ? "Säljs om kursen sjunker under" : "Säljs om kursen stiger över");

    return (
      <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">{label}</span>
          <button onClick={() => setShowForm(null)} className="p-0.5 rounded hover:bg-muted">
            <X className="h-3 w-3" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{hint} detta pris (SEK):</p>
        <div className="flex gap-2">
          <Input
            type="number"
            min={0.01}
            step="0.01"
            placeholder={currentPriceSek ? currentPriceSek.toFixed(2) : "0.00"}
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            className="font-mono h-8 text-sm"
          />
          <Input
            type="number"
            min={1}
            max={shares}
            value={protectShares}
            onChange={(e) => setProtectShares(e.target.value)}
            className="font-mono h-8 text-sm w-20"
            title="Antal"
          />
          <Button size="sm" className="h-8 px-3" onClick={handleSubmit} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "OK"}
          </Button>
        </div>
      </div>
    );
  }

  const hasActiveSL = pendingOrders.some(
    (o) => o.ticker === ticker && o.order_type === "stop_loss" && o.status === "pending" && o.for_short === forShort
  );
  const hasActiveTP = pendingOrders.some(
    (o) => o.ticker === ticker && o.order_type === "take_profit" && o.status === "pending" && o.for_short === forShort
  );

  return (
    <div className="flex gap-1 mt-1">
      <button
        onClick={() => setShowForm("stop_loss")}
        className={`inline-flex items-center gap-1 text-xs transition-colors px-1.5 py-0.5 rounded ${
          hasActiveSL
            ? "text-loss bg-loss/10 glow-loss"
            : "text-muted-foreground hover:text-loss hover:bg-loss/10"
        }`}
        title="Stop-Loss"
      >
        <Shield className="h-3 w-3" />
        SL
      </button>
      <button
        onClick={() => setShowForm("take_profit")}
        className={`inline-flex items-center gap-1 text-xs transition-colors px-1.5 py-0.5 rounded ${
          hasActiveTP
            ? "text-gain bg-gain/10 glow-gain"
            : "text-muted-foreground hover:text-gain hover:bg-gain/10"
        }`}
        title="Take-Profit"
      >
        <Target className="h-3 w-3" />
        TP
      </button>
    </div>
  );
}

export function HoldingsTable({ holdings, shortPositions, totalValue, savingsBalance }: HoldingsTableProps) {
  const { activeCompetition, activeTeam } = useCompetition();
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const fetchOrders = async () => {
      if (!activeCompetition || !activeTeam) return;
      const data = await getOrders(activeCompetition.id, activeTeam.id);
      setPendingOrders(data.filter((o) => o.status === "pending"));
    };
    fetchOrders();
    intervalRef.current = setInterval(fetchOrders, 30_000);
    return () => clearInterval(intervalRef.current);
  }, [activeCompetition, activeTeam]);

  const hasShorts = shortPositions && shortPositions.length > 0;
  const hasSavings = (savingsBalance ?? 0) > 0;

  if (holdings.length === 0 && !hasShorts && !hasSavings) {
    return (
      <div className="rounded-xl border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-4">Innehav</h2>
        <p className="text-muted-foreground text-sm text-center py-4">
          Inga innehav ännu. Börja handla!
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold mb-4">Innehav</h2>
      {holdings.length > 0 && (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {holdings.map((h) => {
              const isPositive = (h.unrealized_pnl_sek ?? 0) >= 0;
              const isSE = h.ticker.endsWith(".ST") || h.currency === "SEK";
              return (
                <div key={h.ticker} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Link
                        to={`/stock/${encodeURIComponent(h.ticker)}`}
                        className="font-mono font-semibold text-sm hover:text-primary hover:underline"
                      >
                        {h.ticker}
                      </Link>
                      <Badge variant="outline" className="text-xs px-1.5 py-0">
                        {isSE ? "🇸🇪" : "🇺🇸"}
                      </Badge>
                      {h.stale && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 border-yellow-500 text-yellow-500">
                          stale
                        </Badge>
                      )}
                    </div>
                    <span className={`font-mono text-sm font-medium ${isPositive ? "text-gain" : "text-loss"}`}>
                      {h.unrealized_pnl_percent !== undefined
                        ? `${isPositive ? "+" : ""}${h.unrealized_pnl_percent.toFixed(1)}%`
                        : "–"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{h.stock_name}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Antal</p>
                      <p className="font-mono font-semibold">{h.total_shares}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Kurs</p>
                      <p className="font-mono font-semibold">{h.current_price_sek ? formatSEK(h.current_price_sek) : "–"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Värde</p>
                      <p className="font-mono font-semibold">{h.market_value_sek ? formatSEK(h.market_value_sek) : "–"}</p>
                    </div>
                  </div>
                  <ProtectionButtons
                    ticker={h.ticker}
                    stockName={h.stock_name}
                    shares={h.total_shares}
                    currentPriceSek={h.current_price_sek}
                    forShort={false}
                    currency={h.currency}
                    pendingOrders={pendingOrders}
                  />
                </div>
              );
            })}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aktie</TableHead>
                <TableHead className="text-right">Antal</TableHead>
                <TableHead className="text-right">GAV (SEK)</TableHead>
                <TableHead className="text-right">Kurs (SEK)</TableHead>
                <TableHead className="text-right">Värde (SEK)</TableHead>
                <TableHead className="text-right">Andel</TableHead>
                <TableHead className="text-right">Avkastning</TableHead>
                <TableHead className="text-right">Skydd</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.map((h) => {
                const isPositive = (h.unrealized_pnl_sek ?? 0) >= 0;
                const isSE = h.ticker.endsWith(".ST") || h.currency === "SEK";

                return (
                  <TableRow key={h.ticker}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/stock/${encodeURIComponent(h.ticker)}`}
                          className="font-mono font-semibold text-sm hover:text-primary hover:underline"
                        >
                          {h.ticker}
                        </Link>
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          {isSE ? "🇸🇪" : "🇺🇸"}
                        </Badge>
                        {h.stale && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0 border-yellow-500 text-yellow-500">
                            stale
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{h.stock_name}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{h.total_shares}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatSEK(h.avg_cost_per_share_sek)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {h.current_price_sek ? formatSEK(h.current_price_sek) : "–"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {h.market_value_sek ? formatSEK(h.market_value_sek) : "–"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {h.market_value_sek && totalValue
                        ? `${((h.market_value_sek / totalValue) * 100).toFixed(1)}%`
                        : "–"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm font-medium ${isPositive ? "text-gain" : "text-loss"}`}
                    >
                      {h.unrealized_pnl_percent !== undefined
                        ? `${isPositive ? "+" : ""}${h.unrealized_pnl_percent.toFixed(1)}%`
                        : "–"}
                    </TableCell>
                    <TableCell className="text-right">
                      <ProtectionButtons
                        ticker={h.ticker}
                        stockName={h.stock_name}
                        shares={h.total_shares}
                        currentPriceSek={h.current_price_sek}
                        forShort={false}
                        currency={h.currency}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </>
      )}

      {hasSavings && (
        <div className="rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 to-transparent p-3 mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-medium">Haull Ånnan Sparkonto</p>
              <p className="text-xs text-muted-foreground">Ränta 0,35% · Insättningsgaranti</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono font-bold text-sm">{formatSEK(savingsBalance!)}</p>
            {totalValue ? (
              <p className="text-xs text-muted-foreground font-mono">
                {((savingsBalance! / totalValue) * 100).toFixed(1)}% av portföljen
              </p>
            ) : null}
          </div>
        </div>
      )}

      {hasShorts && (
        <>
          <h3 className="text-base font-semibold mt-6 mb-3 flex items-center gap-2">
            Blankade positioner
            <Badge variant="outline" className="text-xs border-loss text-loss">SHORT</Badge>
          </h3>
          {/* Mobile cards for shorts */}
          <div className="space-y-3 md:hidden">
            {shortPositions!.map((sp) => {
              const pnl = sp.unrealized_pnl_sek ?? 0;
              const isPositive = pnl >= 0;
              return (
                <div key={sp.id} className="rounded-lg border border-loss/20 bg-loss/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/stock/${encodeURIComponent(sp.ticker)}`}
                        className="font-mono font-semibold text-sm hover:text-primary hover:underline"
                      >
                        {sp.ticker}
                      </Link>
                      <Badge variant="outline" className="text-xs px-1.5 py-0 border-loss text-loss">SHORT</Badge>
                    </div>
                    <span className={`font-mono text-sm font-medium ${isPositive ? "text-gain" : "text-loss"}`}>
                      {sp.unrealized_pnl_percent !== undefined
                        ? `${isPositive ? "+" : ""}${sp.unrealized_pnl_percent.toFixed(1)}%`
                        : "–"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{sp.stock_name}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Antal</p>
                      <p className="font-mono font-semibold">{sp.shares}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Kurs</p>
                      <p className="font-mono font-semibold">{sp.current_price_sek ? formatSEK(sp.current_price_sek) : "–"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Marginal</p>
                      <p className="font-mono font-semibold">{formatSEK(sp.margin_reserved_sek)}</p>
                    </div>
                  </div>
                  <ProtectionButtons
                    ticker={sp.ticker}
                    stockName={sp.stock_name}
                    shares={sp.shares}
                    currentPriceSek={sp.current_price_sek}
                    forShort={true}
                    currency="SEK"
                    pendingOrders={pendingOrders}
                  />
                </div>
              );
            })}
          </div>
          {/* Desktop table for shorts */}
          <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aktie</TableHead>
                <TableHead className="text-right">Antal</TableHead>
                <TableHead className="text-right">Inköpskurs (SEK)</TableHead>
                <TableHead className="text-right">Kurs (SEK)</TableHead>
                <TableHead className="text-right">Marginal (SEK)</TableHead>
                <TableHead className="text-right">P&L</TableHead>
                <TableHead className="text-right">Skydd</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shortPositions!.map((sp) => {
                const pnl = sp.unrealized_pnl_sek ?? 0;
                const isPositive = pnl >= 0;

                return (
                  <TableRow key={sp.id} className="bg-loss/5">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/stock/${encodeURIComponent(sp.ticker)}`}
                          className="font-mono font-semibold text-sm hover:text-primary hover:underline"
                        >
                          {sp.ticker}
                        </Link>
                        <Badge variant="outline" className="text-xs px-1.5 py-0 border-loss text-loss">
                          SHORT
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{sp.stock_name}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{sp.shares}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatSEK(sp.entry_price_sek)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {sp.current_price_sek ? formatSEK(sp.current_price_sek) : "–"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatSEK(sp.margin_reserved_sek)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm font-medium ${isPositive ? "text-gain" : "text-loss"}`}
                    >
                      {sp.unrealized_pnl_percent !== undefined
                        ? `${isPositive ? "+" : ""}${sp.unrealized_pnl_percent.toFixed(1)}%`
                        : "–"}
                    </TableCell>
                    <TableCell className="text-right">
                      <ProtectionButtons
                        ticker={sp.ticker}
                        stockName={sp.stock_name}
                        shares={sp.shares}
                        currentPriceSek={sp.current_price_sek}
                        forShort={true}
                        currency="SEK"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </>
      )}
    </div>
  );
}
