import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatSEK } from "@/lib/mockData";
import type { Holding } from "@/types/trading";

interface HoldingsTableProps {
  holdings: Holding[];
}

export function HoldingsTable({ holdings }: HoldingsTableProps) {
  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Innehav</h2>
        <p className="text-muted-foreground text-sm text-center py-4">
          Inga innehav ännu. Börja handla!
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-6">
      <h2 className="text-lg font-semibold mb-4">Innehav</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Aktie</TableHead>
            <TableHead className="text-right">Antal</TableHead>
            <TableHead className="text-right">GAV (SEK)</TableHead>
            <TableHead className="text-right">Kurs (SEK)</TableHead>
            <TableHead className="text-right">Värde (SEK)</TableHead>
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
                    <span className="font-mono font-semibold text-sm">{h.ticker}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {isSE ? "🇸🇪" : "🇺🇸"}
                    </Badge>
                    {h.stale && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-yellow-500 text-yellow-500">
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
  );
}
