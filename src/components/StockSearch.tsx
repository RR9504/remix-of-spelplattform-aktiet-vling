import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { mockStocks, formatPrice, type Stock } from "@/lib/mockData";
import { TradeDialog } from "./TradeDialog";

export function StockSearch() {
  const [query, setQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);

  const filtered = query.length > 0
    ? mockStocks.filter(s =>
        s.ticker.toLowerCase().includes(query.toLowerCase()) ||
        s.name.toLowerCase().includes(query.toLowerCase())
      )
    : mockStocks;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Sök aktie (ticker eller namn)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10 bg-card"
        />
      </div>
      <div className="grid gap-2">
        {filtered.map((stock) => {
          const isPositive = stock.change >= 0;
          return (
            <button
              key={stock.ticker}
              onClick={() => setSelectedStock(stock)}
              className="flex items-center justify-between rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{stock.market === 'SE' ? '🇸🇪' : '🇺🇸'}</span>
                <div>
                  <p className="font-mono font-semibold text-sm">{stock.ticker}</p>
                  <p className="text-xs text-muted-foreground">{stock.name}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-medium">{formatPrice(stock.price, stock.currency)}</p>
                <p className={`text-xs font-mono font-medium ${isPositive ? 'text-gain' : 'text-loss'}`}>
                  {isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {selectedStock && (
        <TradeDialog stock={selectedStock} onClose={() => setSelectedStock(null)} />
      )}
    </div>
  );
}
