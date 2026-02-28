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
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token ?? ""}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
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
    return await res.json();
  } catch {
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

    // All 5 queries in parallel — direct Supabase, no edge function
    const [ctRes, holdingsRes, shortsRes, tradesRes] = await Promise.all([
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
    ]);

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
      const currentPriceSek = cached ? cached.price_sek : Number(h.avg_cost_per_share_sek);
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
      const currentPriceSek = cached ? cached.price_sek : Number(sp.entry_price_sek);
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

    // Fire-and-forget: refresh stale prices via edge function
    const staleTickers = allTickers.filter((t) => {
      const c = priceMap[t];
      if (!c) return true;
      return (Date.now() - new Date(c.updated_at).getTime()) > STALE_MS;
    });
    if (staleTickers.length > 0) {
      getAuthHeaders().then((headers) => {
        for (const ticker of staleTickers) {
          fetch(
            `${SUPABASE_URL}/functions/v1/fetch-stock-price?ticker=${encodeURIComponent(ticker)}`,
            { headers }
          ).catch(() => {});
        }
      }).catch(() => {});
    }

    // Fire-and-forget: upsert today's snapshot
    const today = new Date().toISOString().split("T")[0];
    supabase
      .from("portfolio_snapshots")
      .upsert(
        {
          competition_id: competitionId,
          team_id: teamId,
          snapshot_date: today,
          total_value_sek: Math.round(totalValue * 100) / 100,
          cash_sek: Math.round(cash * 100) / 100,
          holdings_value_sek: Math.round(holdingsValue * 100) / 100,
        },
        { onConflict: "competition_id,team_id,snapshot_date" }
      )
      .then(() => {})
      .catch(() => {});

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
    const headers = await getAuthHeaders();
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") searchParams.set(k, String(v));
    });
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/get-trade-history?${searchParams}`,
      { headers }
    );
    if (!res.ok) return { trades: [], total: 0 };
    return await res.json();
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

// --- Comparison Chart ---

export async function getComparisonData(
  competitionId: string,
  teamId: string
): Promise<ComparisonData | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/get-comparison-data?competition_id=${competitionId}&team_id=${teamId}`,
      { headers }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
