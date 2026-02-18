import { mockHoldings, formatPrice, USD_SEK } from "@/lib/mockData";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function HoldingsTable() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <h2 className="text-lg font-semibold mb-4">Innehav</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Aktie</TableHead>
            <TableHead className="text-right">Antal</TableHead>
            <TableHead className="text-right">GAV</TableHead>
            <TableHead className="text-right">Kurs</TableHead>
            <TableHead className="text-right">Värde (SEK)</TableHead>
            <TableHead className="text-right">Avkastning</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mockHoldings.map((h) => {
            const valueSEK = h.shares * h.currentPrice * (h.currency === 'USD' ? USD_SEK : 1);
            const costSEK = h.shares * h.avgPrice * (h.currency === 'USD' ? USD_SEK : 1);
            const returnAmount = valueSEK - costSEK;
            const returnPercent = ((returnAmount / costSEK) * 100).toFixed(1);
            const isPositive = returnAmount >= 0;

            return (
              <TableRow key={h.ticker}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-sm">{h.ticker}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {h.market === 'SE' ? '🇸🇪' : '🇺🇸'}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{h.name}</span>
                </TableCell>
                <TableCell className="text-right font-mono">{h.shares}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatPrice(h.avgPrice, h.currency)}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatPrice(h.currentPrice, h.currency)}</TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(valueSEK)}
                </TableCell>
                <TableCell className={`text-right font-mono text-sm font-medium ${isPositive ? 'text-gain' : 'text-loss'}`}>
                  {isPositive ? '+' : ''}{returnPercent}%
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
