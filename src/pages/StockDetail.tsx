import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceDot,
} from "recharts";
import { Navbar } from "@/components/Navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { formatSEK, formatPrice } from "@/lib/mockData";
import { getStockDetails, fetchStockPrice, getInsiderTrades } from "@/lib/api";
import { useCompetition } from "@/contexts/CompetitionContext";
import { TradeDialog } from "@/components/TradeDialog";
import { WatchlistButton } from "@/components/WatchlistButton";
import type { StockDetails, StockPrice, Trade, InsiderTransaction } from "@/types/trading";

const RANGES = [
  { key: "1w", label: "1V" },
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "1y", label: "1A" },
];

// Custom marker rendered on the chart for buy/sell trades
function TradeMarker({ cx, cy, trade }: { cx?: number; cy?: number; trade: Trade }) {
  if (cx === undefined || cy === undefined) return null;
  const isBuy = trade.side === "buy" || trade.side === "cover";
  const emoji = isBuy ? "\u25B2" : "\u25BC"; // ▲ ▼
  const color = isBuy ? "hsl(142, 71%, 45%)" : "hsl(0, 72%, 51%)";

  return (
    <g>
      <circle cx={cx} cy={cy} r={10} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={1.5} />
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fontWeight="bold"
        fill={color}
      >
        {emoji}
      </text>
    </g>
  );
}

// Merge trades into chart history data
function mergeTradesIntoHistory(
  history: { date: string; close: number }[],
  trades: Trade[]
) {
  // Build a date→close map from history
  const dateMap: Record<string, number> = {};
  for (const h of history) {
    dateMap[h.date] = h.close;
  }

  // Map each trade to the closest chart date + close price
  const tradeMarkers: {
    date: string;
    close: number;
    trade: Trade;
  }[] = [];

  for (const trade of trades) {
    const tradeDate = trade.executed_at.split("T")[0];

    // Exact match
    if (dateMap[tradeDate] !== undefined) {
      tradeMarkers.push({ date: tradeDate, close: dateMap[tradeDate], trade });
      continue;
    }

    // Find closest date in history
    let closest: string | null = null;
    let closestDiff = Infinity;
    const tradeTime = new Date(tradeDate).getTime();

    for (const h of history) {
      const diff = Math.abs(new Date(h.date).getTime() - tradeTime);
      if (diff < closestDiff) {
        closestDiff = diff;
        closest = h.date;
      }
    }

    if (closest && dateMap[closest] !== undefined) {
      tradeMarkers.push({ date: closest, close: dateMap[closest], trade });
    }
  }

  return tradeMarkers;
}

// Custom diamond marker for insider trades
function InsiderMarker({ cx, cy, insider }: { cx?: number; cy?: number; insider: InsiderTransaction }) {
  if (cx === undefined || cy === undefined) return null;
  const isBuy = insider.transaction_type === "buy";
  const isSell = insider.transaction_type === "sell";
  const color = isBuy
    ? "hsl(210, 80%, 55%)"
    : isSell
      ? "hsl(30, 90%, 55%)"
      : "hsl(215, 15%, 55%)";
  const label = isBuy ? "K" : isSell ? "S" : "";

  return (
    <g>
      <polygon
        points={`${cx},${cy - 10} ${cx + 8},${cy} ${cx},${cy + 10} ${cx - 8},${cy}`}
        fill={color}
        fillOpacity={0.2}
        stroke={color}
        strokeWidth={1.5}
      />
      {label && (
        <text
          x={cx}
          y={cy + 1}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={8}
          fontWeight="bold"
          fill={color}
        >
          {label}
        </text>
      )}
    </g>
  );
}

// Merge insider trades into chart history data (same pattern as mergeTradesIntoHistory)
function mergeInsiderTradesIntoHistory(
  history: { date: string; close: number }[],
  insiderTrades: InsiderTransaction[]
) {
  const dateMap: Record<string, number> = {};
  for (const h of history) {
    dateMap[h.date] = h.close;
  }

  const markers: { date: string; close: number; insider: InsiderTransaction }[] = [];

  for (const trade of insiderTrades) {
    const tradeDate = trade.transaction_date;

    if (dateMap[tradeDate] !== undefined) {
      markers.push({ date: tradeDate, close: dateMap[tradeDate], insider: trade });
      continue;
    }

    let closest: string | null = null;
    let closestDiff = Infinity;
    const tradeTime = new Date(tradeDate).getTime();

    for (const h of history) {
      const diff = Math.abs(new Date(h.date).getTime() - tradeTime);
      if (diff < closestDiff) {
        closestDiff = diff;
        closest = h.date;
      }
    }

    if (closest && dateMap[closest] !== undefined) {
      markers.push({ date: closest, close: dateMap[closest], insider: trade });
    }
  }

  return markers;
}

const StockDetailPage = () => {
  const { ticker } = useParams<{ ticker: string }>();
  const { activeCompetition } = useCompetition();
  const [details, setDetails] = useState<StockDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("1m");
  const [showTrade, setShowTrade] = useState(false);
  const [priceData, setPriceData] = useState<StockPrice | null>(null);
  const [showInsiders, setShowInsiders] = useState(false);
  const [insiderTrades, setInsiderTrades] = useState<InsiderTransaction[]>([]);
  const [insidersLoading, setInsidersLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    getStockDetails(ticker, activeCompetition?.id, range).then((data) => {
      setDetails(data);
      setLoading(false);
    });
  }, [ticker, activeCompetition?.id, range]);

  const handleOpenTrade = async () => {
    if (!ticker) return;
    const price = await fetchStockPrice(ticker);
    setPriceData(price);
    setShowTrade(true);
  };

  // Lazy-fetch insider trades when toggle is turned on
  const handleToggleInsiders = useCallback(async () => {
    if (!showInsiders && insiderTrades.length === 0 && ticker) {
      setInsidersLoading(true);
      const trades = await getInsiderTrades(ticker);
      setInsiderTrades(trades);
      setInsidersLoading(false);
    }
    setShowInsiders((prev) => !prev);
  }, [showInsiders, insiderTrades.length, ticker]);

  // Compute trade markers for the chart
  const tradeMarkers = details
    ? mergeTradesIntoHistory(details.history, details.recent_trades)
    : [];

  // Compute insider trade markers
  const insiderMarkers = details && showInsiders
    ? mergeInsiderTradesIntoHistory(details.history, insiderTrades)
    : [];

  // Build a date index for ReferenceDot x positioning
  const dateIndex: Record<string, number> = {};
  if (details) {
    details.history.forEach((h, i) => {
      dateIndex[h.date] = i;
    });
  }

  if (!ticker) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 pb-20 md:pb-6 space-y-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !details ? (
          <p className="text-center text-muted-foreground py-16">
            Kunde inte hämta information om {ticker}
          </p>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{ticker.endsWith(".ST") ? "\u{1f1f8}\u{1f1ea}" : "\u{1f1fa}\u{1f1f8}"}</span>
                  <h1 className="text-2xl font-bold font-mono">{ticker}</h1>
                  <span className="text-muted-foreground">{details.name}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-2xl sm:text-3xl font-bold font-mono">
                    {formatPrice(details.price, details.currency)}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-sm ${
                      details.change_percent >= 0
                        ? "border-gain text-gain"
                        : "border-loss text-loss"
                    }`}
                  >
                    {details.change_percent >= 0 ? "+" : ""}
                    {details.change_percent.toFixed(2)}%
                  </Badge>
                </div>
                {details.currency !== "SEK" && (
                  <p className="text-sm text-muted-foreground mt-1">
                    = {formatSEK(details.price_sek)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <WatchlistButton ticker={ticker} stockName={details?.name} variant="default" />
                <Button onClick={handleOpenTrade}>Handla {ticker}</Button>
              </div>
            </div>

            {/* Chart */}
            <div className="rounded-xl border bg-card p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                <div className="flex flex-wrap items-center gap-4">
                  <h2 className="text-sm font-semibold text-muted-foreground">Kurshistorik</h2>
                  {tradeMarkers.length > 0 && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded-full bg-gain/20 border border-gain text-[8px] leading-3 text-center text-gain font-bold">{"\u25B2"}</span>
                        Köp/Cover
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 rounded-full bg-loss/20 border border-loss text-[8px] leading-3 text-center text-loss font-bold">{"\u25BC"}</span>
                        Sälj/Blanka
                      </span>
                    </div>
                  )}
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showInsiders}
                      onChange={handleToggleInsiders}
                      disabled={insidersLoading}
                      className="accent-blue-500 w-3 h-3"
                    />
                    <svg width="12" height="12" viewBox="0 0 12 12">
                      <polygon points="6,1 11,6 6,11 1,6" fill="hsl(210, 80%, 55%)" fillOpacity={0.3} stroke="hsl(210, 80%, 55%)" strokeWidth={1} />
                    </svg>
                    {insidersLoading ? "Laddar..." : "Insynshandel"}
                  </label>
                </div>
                <div className="flex gap-1">
                  {RANGES.map((r) => (
                    <Button
                      key={r.key}
                      variant={range === r.key ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRange(r.key)}
                    >
                      {r.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="h-[300px] w-full">
                {details.history.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={details.history}>
                      <defs>
                        <linearGradient id="stockGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(174, 72%, 46%)" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="hsl(174, 72%, 46%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: "hsl(215, 15%, 55%)" }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: "hsl(215, 15%, 55%)" }}
                        domain={["auto", "auto"]}
                        width={60}
                        label={{ value: details.currency, position: "insideTopLeft", offset: -5, style: { fontSize: 11, fill: "hsl(215, 15%, 55%)" } }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(222, 25%, 9%)",
                          border: "1px solid hsl(222, 18%, 16%)",
                          borderRadius: "8px",
                          color: "hsl(210, 20%, 92%)",
                          fontSize: "13px",
                        }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const close = payload[0]?.value;
                          // Find trades on this date
                          const dateTrades = tradeMarkers.filter((m) => m.date === label);
                          const dateInsiders = showInsiders ? insiderMarkers.filter((m) => m.date === label) : [];
                          return (
                            <div
                              style={{
                                backgroundColor: "hsl(222, 25%, 9%)",
                                border: "1px solid hsl(222, 18%, 16%)",
                                borderRadius: "8px",
                                color: "hsl(210, 20%, 92%)",
                                fontSize: "13px",
                                padding: "8px 12px",
                              }}
                            >
                              <p className="font-mono text-sm">{label}: {Number(close).toFixed(2)} {details.currency}</p>
                              {dateTrades.map((m, i) => {
                                const isBuy = m.trade.side === "buy" || m.trade.side === "cover";
                                return (
                                  <p
                                    key={i}
                                    className="text-xs mt-1"
                                    style={{ color: isBuy ? "hsl(142, 71%, 45%)" : "hsl(0, 72%, 51%)" }}
                                  >
                                    {m.trade.side === "buy" ? "\u25B2 Köp"
                                      : m.trade.side === "sell" ? "\u25BC Sälj"
                                      : m.trade.side === "short" ? "\u25BC Blanka"
                                      : "\u25B2 Cover"}{" "}
                                    {m.trade.shares} st @ {m.trade.price_per_share.toFixed(2)} {m.trade.currency}
                                  </p>
                                );
                              })}
                              {dateInsiders.map((m, i) => {
                                const ins = m.insider;
                                const isBuy = ins.transaction_type === "buy";
                                const color = isBuy ? "hsl(210, 80%, 55%)" : ins.transaction_type === "sell" ? "hsl(30, 90%, 55%)" : "hsl(215, 15%, 55%)";
                                const typeLabel = isBuy ? "Insiderköp" : ins.transaction_type === "sell" ? "Insidersälj" : "Insidertransaktion";
                                return (
                                  <p key={`ins-${i}`} className="text-xs mt-1" style={{ color }}>
                                    {"\u25C6"} {typeLabel}: {ins.insider_name}
                                    {ins.title ? ` (${ins.title})` : ""}
                                    {ins.shares ? ` — ${ins.shares.toLocaleString("sv-SE")} st` : ""}
                                    {ins.value_sek ? ` (${ins.value_sek.toLocaleString("sv-SE")} kr)` : ""}
                                  </p>
                                );
                              })}
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="close"
                        stroke="hsl(174, 72%, 46%)"
                        strokeWidth={2}
                        fill="url(#stockGradient)"
                      />
                      {/* Trade markers */}
                      {tradeMarkers.map((marker, i) => (
                        <ReferenceDot
                          key={`trade-${i}`}
                          x={marker.date}
                          y={marker.close}
                          shape={<TradeMarker trade={marker.trade} />}
                        />
                      ))}
                      {/* Insider trade markers */}
                      {showInsiders && insiderMarkers.map((marker, i) => (
                        <ReferenceDot
                          key={`insider-${i}`}
                          x={marker.date}
                          y={marker.close}
                          shape={<InsiderMarker insider={marker.insider} />}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    Ingen historikdata tillgänglig
                  </div>
                )}
              </div>
            </div>

            {/* Key Stats */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">P/E-tal</p>
                <p className="text-lg font-mono font-semibold">
                  {details.pe_ratio ? details.pe_ratio.toFixed(1) : "–"}
                </p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">Marknadsvärde</p>
                <p className="text-lg font-mono font-semibold">
                  {details.market_cap
                    ? details.market_cap >= 1e9
                      ? `${(details.market_cap / 1e9).toFixed(1)}B`
                      : `${(details.market_cap / 1e6).toFixed(0)}M`
                    : "–"}
                </p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">52v högsta/lägsta</p>
                <p className="text-lg font-mono font-semibold">
                  {details.week52_high && details.week52_low
                    ? `${details.week52_low.toFixed(0)} – ${details.week52_high.toFixed(0)}`
                    : "–"}
                </p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">Volym</p>
                <p className="text-lg font-mono font-semibold">
                  {details.volume
                    ? details.volume >= 1e6
                      ? `${(details.volume / 1e6).toFixed(1)}M`
                      : details.volume.toLocaleString("sv-SE")
                    : "–"}
                </p>
              </div>
            </div>

            {/* Owners */}
            {details.owners.length > 0 && (
              <div className="rounded-xl border bg-card p-6">
                <h2 className="text-lg font-semibold mb-4">Lag som äger {ticker}</h2>
                <div className="space-y-2">
                  {details.owners.map((owner) => (
                    <div
                      key={owner.team_id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <span className="font-medium">{owner.team_name}</span>
                      <span className="font-mono text-sm">{owner.shares} st</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Trades */}
            {details.recent_trades.length > 0 && (
              <div className="rounded-xl border bg-card p-4 sm:p-6">
                <h2 className="text-lg font-semibold mb-4">Senaste affärer</h2>
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead className="text-right">Antal</TableHead>
                      <TableHead className="text-right">Kurs</TableHead>
                      <TableHead className="text-right">Total (SEK)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.recent_trades.map((trade) => (
                      <TableRow key={trade.id}>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(trade.executed_at).toLocaleDateString("sv-SE")}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              trade.side === "buy" ? "border-gain text-gain" : "border-loss text-loss"
                            }`}
                          >
                            {trade.side === "buy" ? "Köp" : "Sälj"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{trade.shares}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {trade.price_per_share.toFixed(2)} {trade.currency}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatSEK(trade.total_sek)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </div>
            )}
          </>
        )}

        {showTrade && (
          <TradeDialog
            stock={{ ticker, name: details?.name || ticker, exchange: "", currency: details?.currency || "SEK" }}
            priceData={priceData}
            onClose={() => setShowTrade(false)}
          />
        )}
      </main>
    </div>
  );
};

export default StockDetailPage;
