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

export async function getPortfolio(
  competitionId: string,
  teamId: string
): Promise<Portfolio | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/get-portfolio?competition_id=${competitionId}&team_id=${teamId}`,
      { headers }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
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
