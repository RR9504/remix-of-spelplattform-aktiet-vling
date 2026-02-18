import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Stock, formatPrice, USD_SEK, isMarketOpen } from "@/lib/mockData";
import { toast } from "sonner";

interface TradeDialogProps {
  stock: Stock;
  onClose: () => void;
}

export function TradeDialog({ stock, onClose }: TradeDialogProps) {
  const [shares, setShares] = useState("");
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const qty = parseInt(shares) || 0;
  const costInCurrency = qty * stock.price;
  const costSEK = stock.currency === 'USD' ? costInCurrency * USD_SEK : costInCurrency;
  const marketOpen = isMarketOpen(stock.market);

  const handleTrade = () => {
    if (!marketOpen) {
      toast.error("Marknaden är stängd just nu");
      return;
    }
    if (qty <= 0) {
      toast.error("Ange antal aktier");
      return;
    }
    toast.success(`${side === 'buy' ? 'Köpt' : 'Sålt'} ${qty} st ${stock.ticker} för ${formatPrice(costSEK, 'SEK')}`);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{stock.market === 'SE' ? '🇸🇪' : '🇺🇸'}</span>
            <span className="font-mono">{stock.ticker}</span>
            <span className="text-muted-foreground font-normal text-sm">– {stock.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={side === 'buy' ? 'default' : 'outline'}
              className={side === 'buy' ? 'flex-1 bg-gain hover:bg-gain/90' : 'flex-1'}
              onClick={() => setSide('buy')}
            >
              Köp
            </Button>
            <Button
              variant={side === 'sell' ? 'default' : 'outline'}
              className={side === 'sell' ? 'flex-1 bg-loss hover:bg-loss/90' : 'flex-1'}
              onClick={() => setSide('sell')}
            >
              Sälj
            </Button>
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Kurs</label>
            <p className="font-mono text-lg font-semibold">{formatPrice(stock.price, stock.currency)}</p>
            {stock.currency === 'USD' && (
              <p className="text-xs text-muted-foreground">Växelkurs: 1 USD = {USD_SEK} SEK</p>
            )}
          </div>

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

          {qty > 0 && (
            <div className="rounded-lg bg-surface p-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total kostnad</span>
                <span className="font-mono font-semibold">{formatPrice(costSEK, 'SEK')}</span>
              </div>
              {stock.currency === 'USD' && (
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>I USD</span>
                  <span className="font-mono">{formatPrice(costInCurrency, 'USD')}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs">
            <span className={`h-2 w-2 rounded-full ${marketOpen ? 'bg-gain' : 'bg-loss'}`} />
            <span className="text-muted-foreground">
              {stock.market === 'SE' ? 'Nasdaq Stockholm' : 'NYSE/NASDAQ'}: {marketOpen ? 'Öppen' : 'Stängd'}
            </span>
          </div>

          <Button onClick={handleTrade} className="w-full" disabled={!marketOpen || qty <= 0}>
            {side === 'buy' ? 'Köp' : 'Sälj'} {stock.ticker}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
