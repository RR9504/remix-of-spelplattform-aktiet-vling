import { useState, useEffect } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addToWatchlist, removeFromWatchlist, getWatchlist } from "@/lib/api";
import { toast } from "sonner";

interface WatchlistButtonProps {
  ticker: string;
  stockName?: string;
  variant?: "icon" | "default";
}

export function WatchlistButton({ ticker, stockName, variant = "icon" }: WatchlistButtonProps) {
  const [isWatched, setIsWatched] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getWatchlist().then((items) => {
      setIsWatched(items.some((item) => item.ticker === ticker));
    });
  }, [ticker]);

  const handleToggle = async () => {
    setLoading(true);
    if (isWatched) {
      const ok = await removeFromWatchlist(ticker);
      if (ok) {
        setIsWatched(false);
        toast.success(`${ticker} borttagen från bevakning`);
      } else {
        toast.error("Kunde inte ta bort från bevakning");
      }
    } else {
      const ok = await addToWatchlist(ticker, stockName);
      if (ok) {
        setIsWatched(true);
        toast.success(`${ticker} tillagd i bevakning`);
      } else {
        toast.error("Kunde inte lägga till i bevakning");
      }
    }
    setLoading(false);
  };

  if (variant === "icon") {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggle}
        disabled={loading}
        title={isWatched ? "Ta bort från bevakning" : "Lägg till i bevakning"}
      >
        <Star
          className={`h-4 w-4 ${isWatched ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
        />
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={loading}
    >
      <Star
        className={`h-4 w-4 mr-1.5 ${isWatched ? "fill-yellow-400 text-yellow-400" : ""}`}
      />
      {isWatched ? "Bevakad" : "Bevaka"}
    </Button>
  );
}
