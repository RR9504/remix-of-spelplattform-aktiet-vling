import { supabase } from "@/integrations/supabase/client";
import type {
  StockSearchResult,
  StockPrice,
  TradeRequest,
  TradeResult,
  Portfolio,
  LeaderboardEntry,
  PortfolioSnapshot,
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
