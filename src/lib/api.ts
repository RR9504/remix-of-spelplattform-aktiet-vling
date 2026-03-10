import { supabase } from "@/integrations/supabase/client";
import type {
  StockSearchResult,
  StockPrice,
  TradeRequest,
  TradeResult,
  Portfolio,
  LeaderboardEntry,
  PortfolioSnapshot,
  PlaceOrderRequest,
  PlaceOrderResult,
  PendingOrder,
  TradeHistoryEntry,
  StockDetails,
  Notification,
  Achievement,
  UserAchievement,
  SeasonRankingEntry,
  WatchlistItem,
  ComparisonData,
  InsiderTransaction,
} from "@/types/trading";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token ?? anonKey}`,
    apikey: anonKey,
  };
}

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  if (!query || query.length < 1) return [];
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/search-stocks?query=${encodeURIComponent(query)}`,
      { headers }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchStockPrice(ticker: string): Promise<StockPrice | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/fetch-stock-price?ticker=${encodeURIComponent(ticker)}`,
      { headers }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function executeTrade(trade: TradeRequest): Promise<TradeResult> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/execute-trade`, {
      method: "POST",
      headers,
      body: JSON.stringify(trade),
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      console.error("execute-trade non-JSON response:", res.status, text);
      return { success: false, error: `Serverfel (${res.status})` };
    }
  } catch (e) {
    console.error("execute-trade network error:", e);
    return { success: false, error: "Nätverksfel" };
  }
}

/**
 * Client-side portfolio computation — bypasses edge function cold start.
 * Queries Supabase directly (all tables allow authenticated SELECT).
 */
export async function getPortfolio(
  competitionId: string,
  teamId: string
): Promise<Portfolio | null> {
  try {
    const STALE_MS = 15 * 60 * 1000;

    // All queries in parallel — direct Supabase, no edge function
    const [ctRes, holdingsRes, shortsRes, tradesRes, compRes] = await Promise.all([
      supabase
        .from("competition_teams")
        .select("cash_balance_sek, margin_reserved_sek")
        .eq("competition_id", competitionId)
        .eq("team_id", teamId)
        .single(),
      supabase
        .from("team_holdings")
        .select("*")
        .eq("competition_id", competitionId)
        .eq("team_id", teamId),
      supabase
        .from("short_positions")
        .select("*")
        .eq("competition_id", competitionId)
        .eq("team_id", teamId)
        .is("closed_at", null),
      supabase
        .from("trades")
        .select("*")
        .eq("competition_id", competitionId)
        .eq("team_id", teamId)
        .order("executed_at", { ascending: false })
        .limit(10),
      supabase
        .from("competitions")
        .select("end_date")
        .eq("id", competitionId)
        .single(),
    ]);

    const today = new Date().toISOString().split("T")[0];
    const isEnded = compRes.data && (compRes.data as any).end_date < today;

    const ct = ctRes.data as any;
    if (!ct) return null;

    const holdings = (holdingsRes.data || []) as any[];
    const shortPositions = (shortsRes.data || []) as any[];
    const recentTrades = (tradesRes.data || []) as any[];

    const cash = Number(ct.cash_balance_sek);
    const marginReserved = Number(ct.margin_reserved_sek || 0);

    // Collect tickers and fetch prices
    const holdingTickers = holdings.map((h: any) => h.ticker);
    const shortTickers = shortPositions.map((s: any) => s.ticker);
    const allTickers = [...new Set([...holdingTickers, ...shortTickers])];

    let priceMap: Record<string, { price: number; price_sek: number; updated_at: string }> = {};
    if (allTickers.length > 0) {
      const { data: cached } = await supabase
        .from("stock_price_cache")
        .select("ticker, price, price_sek, updated_at")
        .in("ticker", allTickers);
      for (const p of (cached || []) as any[]) {
        priceMap[p.ticker] = { price: Number(p.price), price_sek: Number(p.price_sek), updated_at: p.updated_at };
      }
    }

    // Enrich holdings
    let holdingsValue = 0;
    const enrichedHoldings: any[] = [];
    for (const h of holdings) {
      const cached = priceMap[h.ticker];
      const currentPriceSek = cached ? cached.price_sek : (Number(h.avg_cost_per_share_sek) || 0);
      const currentPrice = cached ? cached.price : 0;
      const totalShares = Number(h.total_shares);
      const avgCost = Number(h.avg_cost_per_share_sek);
      const marketValueSek = totalShares * currentPriceSek;
      const costBasis = totalShares * avgCost;
      const pnl = marketValueSek - costBasis;
      const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
      holdingsValue += marketValueSek;
      enrichedHoldings.push({
        ticker: h.ticker,
        stock_name: h.stock_name,
        currency: h.currency,
        total_shares: totalShares,
        avg_cost_per_share_sek: avgCost,
        current_price_sek: currentPriceSek,
        current_price: currentPrice,
        market_value_sek: Math.round(marketValueSek * 100) / 100,
        unrealized_pnl_sek: Math.round(pnl * 100) / 100,
        unrealized_pnl_percent: Math.round(pnlPercent * 100) / 100,
        stale: cached ? (Date.now() - new Date(cached.updated_at).getTime() > STALE_MS) : true,
      });
    }

    // Enrich short positions
    let shortLiabilities = 0;
    const enrichedShorts: any[] = [];
    for (const sp of shortPositions) {
      const cached = priceMap[sp.ticker];
      const currentPriceSek = cached ? cached.price_sek : (Number(sp.entry_price_sek) || 0);
      const shares = Number(sp.shares);
      const entryPriceSek = Number(sp.entry_price_sek);
      const currentValue = shares * currentPriceSek;
      const entryValue = shares * entryPriceSek;
      const pnl = entryValue - currentValue;
      const pnlPercent = entryValue > 0 ? (pnl / entryValue) * 100 : 0;
      shortLiabilities += currentValue;
      enrichedShorts.push({
        id: sp.id, competition_id: sp.competition_id, team_id: sp.team_id,
        ticker: sp.ticker, stock_name: sp.stock_name, shares,
        entry_price_sek: entryPriceSek, margin_reserved_sek: Number(sp.margin_reserved_sek),
        current_price_sek: currentPriceSek,
        unrealized_pnl_sek: Math.round(pnl * 100) / 100,
        unrealized_pnl_percent: Math.round(pnlPercent * 100) / 100,
        opened_at: sp.opened_at, closed_at: sp.closed_at,
      });
    }

    const totalValue = cash + holdingsValue - shortLiabilities;

    // Fire-and-forget: call edge function in background for side effects
    // (snapshot upsert requires service role, stale price refresh triggers Yahoo API)
    // Skip for ended competitions — values should be frozen
    if (!isEnded) {
      getAuthHeaders().then((headers) => {
        fetch(
          `${SUPABASE_URL}/functions/v1/get-portfolio?competition_id=${competitionId}&team_id=${teamId}`,
          { headers }
        ).catch(() => {});
      }).catch(() => {});
    }

    return {
      cash,
      holdings: enrichedHoldings,
      total_value: Math.round(totalValue * 100) / 100,
      holdings_value: Math.round(holdingsValue * 100) / 100,
      recent_trades: recentTrades,
      short_positions: enrichedShorts,
      margin_reserved: marginReserved,
    };
  } catch (err) {
    console.error("getPortfolio error:", err);
    return null;
  }
}

export async function getLeaderboard(
  competitionId: string
): Promise<{ leaderboard: LeaderboardEntry[]; start_capital: number } | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/get-leaderboard?competition_id=${competitionId}`,
      { headers }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getPortfolioHistory(
  competitionId: string,
  teamId: string
): Promise<PortfolioSnapshot[]> {
  try {
    const { data, error } = await supabase
      .from("portfolio_snapshots")
      .select("snapshot_date, total_value_sek, cash_sek, holdings_value_sek")
      .eq("competition_id", competitionId)
      .eq("team_id", teamId)
      .order("snapshot_date", { ascending: true });
    if (error) return [];
    return (data as unknown as PortfolioSnapshot[]) || [];
  } catch {
    return [];
  }
}

// --- Pending Orders ---

export async function placeOrder(order: PlaceOrderRequest): Promise<PlaceOrderResult> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/place-order`, {
      method: "POST",
      headers,
      body: JSON.stringify(order),
    });
    return await res.json();
  } catch {
    return { success: false, error: "Nätverksfel" };
  }
}

export async function cancelOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/cancel-order`, {
      method: "POST",
      headers,
      body: JSON.stringify({ order_id: orderId }),
    });
    return await res.json();
  } catch {
    return { success: false, error: "Nätverksfel" };
  }
}

export async function getOrders(
  competitionId: string,
  teamId: string
): Promise<PendingOrder[]> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/get-orders?competition_id=${competitionId}&team_id=${teamId}`,
      { headers }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.orders || [];
  } catch {
    return [];
  }
}

// --- Trade History ---

export async function getTradeHistory(params: {
  competition_id: string;
  team_id?: string;
  ticker?: string;
  side?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<{ trades: TradeHistoryEntry[]; total: number }> {
  try {
    const pageNum = params.page ?? 1;
    const limitNum = Math.min(params.limit ?? 20, 100);
    const offset = (pageNum - 1) * limitNum;

    let query = supabase
      .from("trades")
      .select("*", { count: "exact" })
      .eq("competition_id", params.competition_id);

    if (params.team_id) query = query.eq("team_id", params.team_id);
    if (params.ticker) query = query.eq("ticker", params.ticker);
    if (params.side) query = query.eq("side", params.side);
    if (params.from) query = query.gte("executed_at", params.from);
    if (params.to) query = query.lte("executed_at", params.to + "T23:59:59Z");

    const { data, count, error } = await query
      .order("executed_at", { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) return { trades: [], total: 0 };
    return { trades: (data as unknown as TradeHistoryEntry[]) || [], total: count || 0 };
  } catch {
    return { trades: [], total: 0 };
  }
}

// --- Stock Details ---

export async function getStockDetails(
  ticker: string,
  competitionId?: string,
  range?: string
): Promise<StockDetails | null> {
  try {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams({ ticker });
    if (competitionId) params.set("competition_id", competitionId);
    if (range) params.set("range", range);
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/get-stock-details?${params}`,
      { headers }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// --- Notifications ---

export async function getNotifications(params?: {
  limit?: number;
  unread_only?: boolean;
}): Promise<Notification[]> {
  try {
    const headers = await getAuthHeaders();
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.unread_only) searchParams.set("unread_only", "true");
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/get-notifications?${searchParams}`,
      { headers }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.notifications || [];
  } catch {
    return [];
  }
}

export async function markNotificationsRead(params: {
  notification_ids?: string[];
  all?: boolean;
}): Promise<{ success: boolean }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/mark-notifications-read`, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch {
    return { success: false };
  }
}

// --- Achievements ---

export async function getAchievements(profileId?: string): Promise<{
  achievements: Achievement[];
  unlocked: UserAchievement[];
}> {
  try {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (profileId) params.set("profile_id", profileId);
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/get-achievements?${params}`,
      { headers }
    );
    if (!res.ok) return { achievements: [], unlocked: [] };
    return await res.json();
  } catch {
    return { achievements: [], unlocked: [] };
  }
}

// --- Team Profile ---

export async function getTeamProfile(teamId: string, competitionId?: string): Promise<any | null> {
  try {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams({ team_id: teamId });
    if (competitionId) params.set("competition_id", competitionId);
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/get-team-profile?${params}`,
      { headers }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// --- Season Ranking ---

export async function getSeasonRanking(): Promise<SeasonRankingEntry[]> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-season-ranking`, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return data.ranking || [];
  } catch {
    return [];
  }
}

// --- Watchlist ---

export async function getWatchlist(): Promise<WatchlistItem[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from("watchlist")
      .select("*")
      .eq("profile_id", user.id)
      .order("added_at", { ascending: false });
    if (error) return [];
    return (data as unknown as WatchlistItem[]) || [];
  } catch {
    return [];
  }
}

export async function addToWatchlist(
  ticker: string,
  stockName?: string
): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { error } = await supabase.from("watchlist").insert({
      profile_id: user.id,
      ticker,
      stock_name: stockName || null,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function removeFromWatchlist(ticker: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { error } = await supabase
      .from("watchlist")
      .delete()
      .eq("profile_id", user.id)
      .eq("ticker", ticker);
    return !error;
  } catch {
    return false;
  }
}

export async function updateWatchlistAlert(
  ticker: string,
  thresholdPercent: number | null
): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { error } = await supabase
      .from("watchlist")
      .update({
        alert_threshold_percent: thresholdPercent,
        last_alert_price_sek: null, // Reset reference price
        last_alerted_at: null,
      })
      .eq("profile_id", user.id)
      .eq("ticker", ticker);
    return !error;
  } catch {
    return false;
  }
}

// --- Insider Trades ---

export async function getInsiderTrades(ticker: string): Promise<InsiderTransaction[]> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/get-insider-trades?ticker=${encodeURIComponent(ticker)}`,
      { headers }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.insider_trades ?? [];
  } catch {
    return [];
  }
}

// --- Competition Results (finalized) ---

export async function finalizeCompetition(competitionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/finalize-competition`, {
      method: "POST",
      headers,
      body: JSON.stringify({ competition_id: competitionId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error || "Finalisering misslyckades" };
    }
    return { success: true };
  } catch {
    return { success: false, error: "Nätverksfel" };
  }
}

export interface CompetitionResult {
  team_id: string;
  team_name: string;
  final_rank: number;
  final_value: number;
  final_return_percent: number;
  points: number;
}

export async function getCompetitionResults(competitionId: string): Promise<CompetitionResult[]> {
  try {
    const { data, error } = await supabase
      .from("season_scores")
      .select("team_id, final_rank, final_value, final_return_percent, points, teams(name)")
      .eq("competition_id", competitionId)
      .order("final_rank", { ascending: true });

    if (error || !data) return [];

    return (data as any[]).map((row) => ({
      team_id: row.team_id,
      team_name: (row.teams as any)?.name || "Okänt lag",
      final_rank: row.final_rank,
      final_value: row.final_value,
      final_return_percent: row.final_return_percent,
      points: row.points,
    }));
  } catch {
    return [];
  }
}

// --- Comparison Chart ---

/**
 * Client-side comparison data — bypasses edge function cold start.
 * Returns team comparison data instantly. Benchmark is loaded separately.
 */
export async function getComparisonData(
  competitionId: string,
  teamId: string
): Promise<ComparisonData | null> {
  try {
    // All DB queries in parallel
    const [compRes, ctRes, snapshotsRes, holdingsRes, shortsRes] = await Promise.all([
      supabase
        .from("competitions")
        .select("initial_balance, start_date, end_date")
        .eq("id", competitionId)
        .single(),
      supabase
        .from("competition_teams")
        .select("team_id, cash_balance_sek, margin_reserved_sek, teams(name)")
        .eq("competition_id", competitionId),
      supabase
        .from("portfolio_snapshots")
        .select("team_id, snapshot_date, total_value_sek")
        .eq("competition_id", competitionId)
        .order("snapshot_date", { ascending: true }),
      supabase
        .from("team_holdings")
        .select("*")
        .eq("competition_id", competitionId),
      supabase
        .from("short_positions")
        .select("*")
        .eq("competition_id", competitionId)
        .is("closed_at", null),
    ]);

    const competition = compRes.data as any;
    if (!competition) return null;

    const competitionTeams = (ctRes.data || []) as any[];
    if (competitionTeams.length === 0) return null;

    const snapshots = (snapshotsRes.data || []) as any[];
    const allHoldings = (holdingsRes.data || []) as any[];
    const allShorts = (shortsRes.data || []) as any[];

    const startValue = Number(competition.initial_balance);

    // Fetch prices for all tickers
    const holdingTickers = [...new Set(allHoldings.map((h: any) => h.ticker))];
    const shortTickers = [...new Set(allShorts.map((s: any) => s.ticker))];
    const allTickers = [...new Set([...holdingTickers, ...shortTickers])];
    const priceMap: Record<string, number> = {};
    if (allTickers.length > 0) {
      const { data: prices } = await supabase
        .from("stock_price_cache")
        .select("ticker, price_sek")
        .in("ticker", allTickers);
      for (const p of (prices || []) as any[]) {
        priceMap[p.ticker] = Number(p.price_sek);
      }
    }

    const today = new Date().toISOString().split("T")[0];

    // Build team data with historical snapshots + live today value
    const teams = competitionTeams.map((ct: any) => {
      const teamSnapshots = snapshots
        .filter((s: any) => s.team_id === ct.team_id)
        .map((s: any) => ({
          date: s.snapshot_date,
          value: Number(s.total_value_sek),
          return_percent: startValue > 0
            ? Math.round(((Number(s.total_value_sek) - startValue) / startValue) * 10000) / 100
            : 0,
        }));

      // Compute live value
      const cash = Number(ct.cash_balance_sek);
      const teamHoldings = allHoldings.filter((h: any) => h.team_id === ct.team_id);
      let holdingsValue = 0;
      for (const h of teamHoldings) {
        const priceSek = priceMap[h.ticker] ?? Number(h.avg_cost_per_share_sek);
        holdingsValue += Number(h.total_shares) * priceSek;
      }
      const teamShorts = allShorts.filter((s: any) => s.team_id === ct.team_id);
      let shortLiabilities = 0;
      for (const s of teamShorts) {
        const priceSek = priceMap[s.ticker] ?? Number(s.entry_price_sek);
        shortLiabilities += Number(s.shares) * priceSek;
      }
      const liveValue = cash + holdingsValue - shortLiabilities;
      const liveReturn = startValue > 0
        ? Math.round(((liveValue - startValue) / startValue) * 10000) / 100
        : 0;

      // Add/replace today's data point with live value
      const lastSnapshot = teamSnapshots[teamSnapshots.length - 1];
      if (lastSnapshot && lastSnapshot.date === today) {
        lastSnapshot.value = liveValue;
        lastSnapshot.return_percent = liveReturn;
      } else {
        teamSnapshots.push({
          date: today,
          value: Math.round(liveValue * 100) / 100,
          return_percent: liveReturn,
        });
      }

      return {
        team_id: ct.team_id,
        team_name: (ct.teams as any)?.name || "Okänt lag",
        snapshots: teamSnapshots,
      };
    });

    // Load benchmark from cache if available
    const benchmarkCacheKey = `sa_benchmark_${competitionId}`;
    let benchmarkSnapshots: { date: string; return_percent: number }[] = [];
    try {
      const raw = localStorage.getItem(benchmarkCacheKey);
      if (raw) {
        const { data, ts } = JSON.parse(raw);
        if (Date.now() - ts < 60 * 60 * 1000) benchmarkSnapshots = data; // 1h TTL
      }
    } catch {}

    return {
      teams,
      benchmark: { name: "OMXS30", snapshots: benchmarkSnapshots },
      start_value: startValue,
      my_team_id: teamId,
    };
  } catch (err) {
    console.error("getComparisonData error:", err);
    return null;
  }
}

/**
 * Fetches OMXS30 benchmark data via edge function (requires server-side Yahoo Finance call).
 * Caches result in localStorage for 1 hour.
 */
export async function fetchBenchmark(
  competitionId: string,
  teamId: string
): Promise<{ date: string; return_percent: number }[]> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/get-comparison-data?competition_id=${competitionId}&team_id=${teamId}`,
      { headers }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const snapshots = data?.benchmark?.snapshots || [];
    // Cache for next time
    try {
      localStorage.setItem(
        `sa_benchmark_${competitionId}`,
        JSON.stringify({ data: snapshots, ts: Date.now() })
      );
    } catch {}
    return snapshots;
  } catch {
    return [];
  }
}
