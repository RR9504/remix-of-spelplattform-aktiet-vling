import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { formatSEK } from "@/lib/mockData";
import { getTradeHistory } from "@/lib/api";
import { useCompetition } from "@/contexts/CompetitionContext";
import type { TradeHistoryEntry } from "@/types/trading";

const SIDE_LABELS: Record<string, string> = {
  buy: "Köp",
  sell: "Sälj",
  short: "Blanka",
  cover: "Täck",
};

const History = () => {
  const { activeCompetition, activeTeam } = useCompetition();
  const [trades, setTrades] = useState<TradeHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [ticker, setTicker] = useState("");
  const [side, setSide] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const limit = 20;

  useEffect(() => {
    fetchHistory();
  }, [activeCompetition?.id, activeTeam?.id, page]);

  const fetchHistory = async () => {
    if (!activeCompetition) {
      setTrades([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await getTradeHistory({
      competition_id: activeCompetition.id,
      team_id: activeTeam?.id,
      ticker: ticker || undefined,
      side: side || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
      page,
      limit,
    });
    setTrades(data.trades);
    setTotal(data.total);
    setLoading(false);
  };

  const handleFilter = () => {
    setPage(1);
    fetchHistory();
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Transaktionshistorik</h1>
          <p className="text-muted-foreground text-sm">Alla genomförda affärer</p>
        </div>

        {!activeCompetition ? (
          <p className="text-muted-foreground text-center py-8">
            Välj en tävling för att se historik.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              <Input
                placeholder="Ticker..."
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                className="w-32 bg-card"
              />
              <Select value={side} onValueChange={setSide}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Alla typer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla typer</SelectItem>
                  <SelectItem value="buy">Köp</SelectItem>
                  <SelectItem value="sell">Sälj</SelectItem>
                  <SelectItem value="short">Blanka</SelectItem>
                  <SelectItem value="cover">Täck</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-40 bg-card"
              />
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-40 bg-card"
              />
              <Button onClick={handleFilter} variant="outline">Filtrera</Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : trades.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Inga transaktioner hittades.</p>
            ) : (
              <>
                <div className="rounded-xl border bg-card p-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum</TableHead>
                        <TableHead>Aktie</TableHead>
                        <TableHead>Typ</TableHead>
                        <TableHead className="text-right">Antal</TableHead>
                        <TableHead className="text-right">Kurs</TableHead>
                        <TableHead className="text-right">Total (SEK)</TableHead>
                        <TableHead className="text-right">Realiserad P&L</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trades.map((trade) => {
                        const pnl = trade.realized_pnl_sek;
                        const pnlPositive = pnl !== null && pnl !== undefined && pnl >= 0;
                        return (
                          <TableRow key={trade.id}>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(trade.executed_at).toLocaleDateString("sv-SE")}
                            </TableCell>
                            <TableCell>
                              <span className="font-mono font-semibold text-sm">{trade.ticker}</span>
                              <br />
                              <span className="text-xs text-muted-foreground">{trade.stock_name}</span>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  trade.side === "buy" || trade.side === "cover"
                                    ? "border-gain text-gain"
                                    : "border-loss text-loss"
                                }`}
                              >
                                {SIDE_LABELS[trade.side] || trade.side}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">{trade.shares}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {trade.price_per_share.toFixed(2)} {trade.currency}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatSEK(trade.total_sek)}
                            </TableCell>
                            <TableCell
                              className={`text-right font-mono text-sm ${
                                pnl !== null && pnl !== undefined
                                  ? pnlPositive ? "text-gain" : "text-loss"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {pnl !== null && pnl !== undefined
                                ? `${pnlPositive ? "+" : ""}${formatSEK(pnl)}`
                                : "–"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Sida {page} av {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default History;
