import { Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Landmark } from "lucide-react";
import { formatSEK } from "@/lib/mockData";
import type { Holding, ShortPosition } from "@/types/trading";

interface HoldingsTableProps {
  holdings: Holding[];
  shortPositions?: ShortPosition[];
  totalValue?: number;
  savingsBalance?: number;
}

export function HoldingsTable({ holdings, shortPositions, totalValue, savingsBalance }: HoldingsTableProps) {
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
