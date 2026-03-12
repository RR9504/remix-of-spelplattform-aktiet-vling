import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Navbar } from "@/components/Navbar";
import { AchievementShowcase } from "@/components/AchievementShowcase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Crown, Users, TrendingUp, TrendingDown, Wallet, BarChart3, ArrowRightLeft } from "lucide-react";
import { formatSEK } from "@/lib/mockData";
import { getTeamProfile } from "@/lib/api";
import { useCompetition } from "@/contexts/CompetitionContext";

const SIDE_LABELS: Record<string, string> = {
  buy: "Köp",
  sell: "Sälj",
  short: "Blanka",
  cover: "Täck",
};

const TeamProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const { activeCompetition } = useCompetition();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getTeamProfile(id, activeCompetition?.id).then((data) => {
      setProfile(data);
      setLoading(false);
    });
  }, [id, activeCompetition?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container py-6 pb-28 md:pb-6 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container py-6 pb-28 md:pb-6">
          <p className="text-muted-foreground text-center py-16">Lag hittades inte</p>
        </main>
      </div>
    );
  }

  const chartData = (profile.snapshots || []).map((s: any) => ({
    date: new Date(s.snapshot_date).toLocaleDateString("sv-SE", { day: "numeric", month: "short" }),
    value: s.total_value_sek,
  }));

  const portfolio = profile.portfolio;
  const holdings = profile.holdings || [];
  const shortPositions = profile.short_positions || [];
  const trades = profile.trades || [];
  const hasPortfolioData = portfolio !== null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 pb-28 md:pb-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{profile.team.name}</h1>
            <p className="text-muted-foreground text-sm">
              {profile.members.length} {profile.members.length === 1 ? "medlem" : "medlemmar"}
            </p>
          </div>
        </div>

        {/* Portfolio Summary */}
        {hasPortfolioData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Wallet className="h-3.5 w-3.5" />
                  Totalvärde
                </div>
                <p className="font-mono font-bold text-lg">{formatSEK(portfolio.total_value)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Avkastning
                </div>
                <p className={`font-mono font-bold text-lg ${portfolio.return_percent >= 0 ? "text-gain" : "text-loss"}`}>
                  {portfolio.return_percent >= 0 ? "+" : ""}{portfolio.return_percent.toFixed(2)}%
                </p>
                <p className={`font-mono text-xs ${portfolio.return_percent >= 0 ? "text-gain" : "text-loss"}`}>
                  {portfolio.return_amount >= 0 ? "+" : ""}{formatSEK(portfolio.return_amount)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-muted-foreground text-xs mb-1">Kassa</div>
                <p className="font-mono font-bold text-lg">{formatSEK(portfolio.cash)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-muted-foreground text-xs mb-1">Innehav</div>
                <p className="font-mono font-bold text-lg">{formatSEK(portfolio.holdings_value)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Members */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Medlemmar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.members.map((m: any) => (
                <div key={m.profile_id} className="flex items-center gap-1.5 rounded-full border px-3 py-1.5">
                  <span className="text-sm">{m.name}</span>
                  {m.is_captain && <Crown className="h-3 w-3 text-primary" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Value Chart */}
        {chartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Värdeutveckling</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="profileGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(174, 72%, 46%)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(174, 72%, 46%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(215, 15%, 55%)" }} interval="preserveStartEnd" />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(215, 15%, 55%)" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} domain={["auto", "auto"]} width={50} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(222, 25%, 9%)", border: "1px solid hsl(222, 18%, 16%)", borderRadius: "8px", color: "hsl(210, 20%, 92%)", fontSize: "13px" }} formatter={(value: number) => [formatSEK(value), "Värde"]} />
                    <Area type="monotone" dataKey="value" stroke="hsl(174, 72%, 46%)" strokeWidth={2} fill="url(#profileGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Holdings */}
        {holdings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Aktuella innehav
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {holdings.map((h: any) => {
                  const isPositive = (h.unrealized_pnl_sek ?? 0) >= 0;
                  return (
                    <div key={h.ticker} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Link
                          to={`/stock/${encodeURIComponent(h.ticker)}`}
                          className="font-mono font-semibold text-sm hover:text-primary hover:underline"
                        >
                          {h.ticker}
                        </Link>
                        <span className={`font-mono text-sm font-medium ${h.unrealized_pnl_percent !== null ? (isPositive ? "text-gain" : "text-loss") : "text-muted-foreground"}`}>
                          {h.unrealized_pnl_percent !== null
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
                      {hasPortfolioData && <TableHead className="text-right">Andel</TableHead>}
                      <TableHead className="text-right">Avkastning</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holdings.map((h: any) => {
                      const isPositive = (h.unrealized_pnl_sek ?? 0) >= 0;
                      return (
                        <TableRow key={h.ticker}>
                          <TableCell>
                            <Link
                              to={`/stock/${encodeURIComponent(h.ticker)}`}
                              className="font-mono font-semibold text-sm hover:text-primary hover:underline"
                            >
                              {h.ticker}
                            </Link>
                            <br />
                            <span className="text-xs text-muted-foreground">{h.stock_name}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono">{h.total_shares}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatSEK(h.avg_cost_per_share_sek)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{h.current_price_sek ? formatSEK(h.current_price_sek) : "–"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{h.market_value_sek ? formatSEK(h.market_value_sek) : "–"}</TableCell>
                          {hasPortfolioData && (
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {h.market_value_sek && portfolio.total_value
                                ? `${((h.market_value_sek / portfolio.total_value) * 100).toFixed(1)}%`
                                : "–"}
                            </TableCell>
                          )}
                          <TableCell className={`text-right font-mono text-sm font-medium ${h.unrealized_pnl_percent !== null ? (isPositive ? "text-gain" : "text-loss") : "text-muted-foreground"}`}>
                            {h.unrealized_pnl_percent !== null
                              ? `${isPositive ? "+" : ""}${h.unrealized_pnl_percent.toFixed(1)}%`
                              : "–"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Short Positions */}
        {shortPositions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingDown className="h-5 w-5" />
                Blankade positioner
                <Badge variant="outline" className="text-xs border-loss text-loss">SHORT</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 md:hidden">
                {shortPositions.map((sp: any) => (
                  <div key={sp.id} className="rounded-lg border border-loss/20 bg-loss/5 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Link
                        to={`/stock/${encodeURIComponent(sp.ticker)}`}
                        className="font-mono font-semibold text-sm hover:text-primary hover:underline"
                      >
                        {sp.ticker}
                      </Link>
                      <Badge variant="outline" className="text-xs px-1.5 py-0 border-loss text-loss">SHORT</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{sp.stock_name}</p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Antal</p>
                        <p className="font-mono font-semibold">{sp.shares}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Inköpskurs</p>
                        <p className="font-mono font-semibold">{formatSEK(sp.entry_price_sek)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Marginal</p>
                        <p className="font-mono font-semibold">{formatSEK(sp.margin_reserved_sek)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aktie</TableHead>
                      <TableHead className="text-right">Antal</TableHead>
                      <TableHead className="text-right">Inköpskurs (SEK)</TableHead>
                      <TableHead className="text-right">Marginal (SEK)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shortPositions.map((sp: any) => (
                      <TableRow key={sp.id} className="bg-loss/5">
                        <TableCell>
                          <Link
                            to={`/stock/${encodeURIComponent(sp.ticker)}`}
                            className="font-mono font-semibold text-sm hover:text-primary hover:underline"
                          >
                            {sp.ticker}
                          </Link>
                          <br />
                          <span className="text-xs text-muted-foreground">{sp.stock_name}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono">{sp.shares}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatSEK(sp.entry_price_sek)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatSEK(sp.margin_reserved_sek)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Trades */}
        {trades.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" />
                Senaste transaktioner
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {trades.map((trade: any) => {
                  const pnl = trade.realized_pnl_sek;
                  const pnlPositive = pnl !== null && pnl !== undefined && pnl >= 0;
                  return (
                    <div key={trade.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-sm">{trade.ticker}</span>
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
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(trade.executed_at).toLocaleDateString("sv-SE")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{trade.stock_name}</p>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono">{trade.shares} st @ {trade.price_per_share.toFixed(2)} {trade.currency}</span>
                        <span
                          className={`font-mono font-medium ${
                            pnl !== null && pnl !== undefined
                              ? pnlPositive ? "text-gain" : "text-loss"
                              : "text-muted-foreground"
                          }`}
                        >
                          {pnl !== null && pnl !== undefined
                            ? `${pnlPositive ? "+" : ""}${formatSEK(pnl)}`
                            : "–"}
                        </span>
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
                    {trades.map((trade: any) => {
                      const pnl = trade.realized_pnl_sek;
                      const pnlPositive = pnl !== null && pnl !== undefined && pnl >= 0;
                      return (
                        <TableRow key={trade.id}>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(trade.executed_at).toLocaleDateString("sv-SE")}
                          </TableCell>
                          <TableCell>
                            <Link
                              to={`/stock/${encodeURIComponent(trade.ticker)}`}
                              className="font-mono font-semibold text-sm hover:text-primary hover:underline"
                            >
                              {trade.ticker}
                            </Link>
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
                          <TableCell className="text-right font-mono text-sm">{formatSEK(trade.total_sek)}</TableCell>
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
            </CardContent>
          </Card>
        )}

        {/* No portfolio data message */}
        {!hasPortfolioData && holdings.length === 0 && trades.length === 0 && (
          <Card>
            <CardContent className="py-8">
              <p className="text-muted-foreground text-sm text-center">
                Innehav och transaktioner visas inte för denna tävling.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Achievements */}
        {profile.members.map((m: any) => (
          <div key={m.profile_id}>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">{m.name}</h3>
            <AchievementShowcase profileId={m.profile_id} />
          </div>
        ))}
      </main>
    </div>
  );
};

export default TeamProfilePage;
