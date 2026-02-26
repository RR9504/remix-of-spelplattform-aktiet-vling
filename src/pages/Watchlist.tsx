import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Star, Eye } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatSEK } from "@/lib/mockData";
import { getWatchlist, removeFromWatchlist } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { WatchlistItem } from "@/types/trading";

interface WatchlistItemWithPrice extends WatchlistItem {
  current_price_sek?: number;
  change_percent?: number;
}

const Watchlist = () => {
  const [items, setItems] = useState<WatchlistItemWithPrice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const watchlistItems = await getWatchlist();

    // Fetch prices from stock_price_cache for all watched tickers
    if (watchlistItems.length > 0) {
      const tickers = watchlistItems.map((item) => item.ticker);
      const { data: prices } = await supabase
        .from("stock_price_cache")
        .select("ticker, price_sek, change_percent")
        .in("ticker", tickers);

      const priceMap: Record<string, { price_sek: number; change_percent?: number }> = {};
      for (const p of prices || []) {
        priceMap[p.ticker] = {
          price_sek: Number(p.price_sek),
          change_percent: p.change_percent != null ? Number(p.change_percent) : undefined,
        };
      }

      const enriched = watchlistItems.map((item) => ({
        ...item,
        current_price_sek: priceMap[item.ticker]?.price_sek,
        change_percent: priceMap[item.ticker]?.change_percent,
      }));
      setItems(enriched);
    } else {
      setItems([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRemove = async (ticker: string) => {
    const ok = await removeFromWatchlist(ticker);
    if (ok) {
      setItems((prev) => prev.filter((item) => item.ticker !== ticker));
      toast.success(`${ticker} borttagen från bevakning`);
    } else {
      toast.error("Kunde inte ta bort från bevakning");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 pb-20 md:pb-6 space-y-6">
        <div className="flex items-center gap-2">
          <Eye className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Bevakning</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center">
            <p className="text-muted-foreground text-sm">
              Din bevakningslista är tom. Sök efter aktier och klicka på stjärnan för att bevaka.
            </p>
            <Link to="/trade" className="mt-4 inline-block">
              <Button variant="outline" size="sm">Sök aktier</Button>
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aktie</TableHead>
                  <TableHead className="text-right">Kurs (SEK)</TableHead>
                  <TableHead className="text-right">Förändring</TableHead>
                  <TableHead className="text-right">Tillagd</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const isSE = item.ticker.endsWith(".ST");
                  const changePositive = (item.change_percent ?? 0) >= 0;

                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/stock/${encodeURIComponent(item.ticker)}`}
                            className="font-mono font-semibold text-sm hover:text-primary hover:underline"
                          >
                            {item.ticker}
                          </Link>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {isSE ? "\u{1f1f8}\u{1f1ea}" : "\u{1f1fa}\u{1f1f8}"}
                          </Badge>
                        </div>
                        {item.stock_name && (
                          <span className="text-xs text-muted-foreground">{item.stock_name}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {item.current_price_sek ? formatSEK(item.current_price_sek) : "–"}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono text-sm font-medium ${
                          changePositive ? "text-gain" : "text-loss"
                        }`}
                      >
                        {item.change_percent !== undefined
                          ? `${changePositive ? "+" : ""}${item.change_percent.toFixed(2)}%`
                          : "–"}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {new Date(item.added_at).toLocaleDateString("sv-SE")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemove(item.ticker)}
                          title="Ta bort från bevakning"
                        >
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
};

export default Watchlist;
