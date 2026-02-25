export interface StockSearchResult {
  ticker: string;
  name: string;
  exchange: string;
  currency: string;
}

export interface StockPrice {
  ticker: string;
  price: number;
  currency: string;
  exchange_rate: number;
  price_sek: number;
  stock_name: string;
  exchange: string;
  stale?: boolean;
}

export interface TradeRequest {
  competition_id: string;
  team_id: string;
  ticker: string;
  side: "buy" | "sell" | "short" | "cover";
  shares: number;
}

export interface TradeResult {
  success: boolean;
  trade_id?: string;
  new_cash_balance?: number;
  error?: string;
  trade?: Trade;
}

export interface Trade {
  id: string;
  competition_id: string;
  team_id: string;
  executed_by: string;
  ticker: string;
  stock_name: string;
  side: "buy" | "sell" | "short" | "cover";
  shares: number;
  price_per_share: number;
  currency: string;
  exchange_rate: number;
  total_sek: number;
  realized_pnl_sek?: number | null;
  executed_at: string;
}

export interface Holding {
  ticker: string;
  stock_name: string;
  currency: string;
  total_shares: number;
  avg_cost_per_share_sek: number;
  current_price_sek?: number;
  current_price?: number;
  market_value_sek?: number;
  unrealized_pnl_sek?: number;
  unrealized_pnl_percent?: number;
  stale?: boolean;
}

export interface Portfolio {
  cash: number;
  holdings: Holding[];
  total_value: number;
  holdings_value: number;
  recent_trades: Trade[];
  short_positions?: ShortPosition[];
  margin_reserved?: number;
}

export interface LeaderboardEntry {
  rank: number;
  team_id: string;
  team_name: string;
  total_value: number;
  cash: number;
  holdings_value: number;
  return_amount: number;
  return_percent: number;
  members: string[];
}

export interface PortfolioSnapshot {
  snapshot_date: string;
  total_value_sek: number;
  cash_sek: number;
  holdings_value_sek: number;
}

export interface CompetitionTeam {
  id: string;
  competition_id: string;
  team_id: string;
  cash_balance_sek: number;
  joined_at: string;
}

// --- Pending Orders (Limit, SL, TP) ---

export type OrderType = "limit_buy" | "limit_sell" | "stop_loss" | "take_profit";
export type OrderStatus = "pending" | "filled" | "cancelled" | "expired";

export interface PendingOrder {
  id: string;
  competition_id: string;
  team_id: string;
  created_by: string;
  ticker: string;
  stock_name: string;
  order_type: OrderType;
  target_price: number;
  shares: number;
  currency: string;
  status: OrderStatus;
  reference_avg_cost_sek: number | null;
  filled_at: string | null;
  filled_trade_id: string | null;
  cancelled_at: string | null;
  created_at: string;
  expires_at: string;
}

export interface PlaceOrderRequest {
  competition_id: string;
  team_id: string;
  ticker: string;
  stock_name: string;
  order_type: OrderType;
  target_price: number;
  shares: number;
  currency?: string;
}

export interface PlaceOrderResult {
  success: boolean;
  order?: PendingOrder;
  error?: string;
}

// --- Short Selling ---

export interface ShortPosition {
  id: string;
  competition_id: string;
  team_id: string;
  ticker: string;
  stock_name: string;
  shares: number;
  entry_price_sek: number;
  margin_reserved_sek: number;
  current_price_sek?: number;
  unrealized_pnl_sek?: number;
  unrealized_pnl_percent?: number;
  opened_at: string;
  closed_at: string | null;
}

// --- Notifications ---

export type NotificationType =
  | "trade_executed"
  | "order_filled"
  | "order_expired"
  | "margin_call"
  | "forced_cover"
  | "achievement_unlocked"
  | "competition_started"
  | "competition_ended"
  | "team_joined";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

// --- Achievements ---

export interface Achievement {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  criteria: Record<string, unknown>;
}

export interface UserAchievement {
  id: string;
  profile_id: string;
  achievement_id: string;
  competition_id: string | null;
  unlocked_at: string;
  achievement?: Achievement;
}

// --- Insider Trades ---

export interface InsiderTransaction {
  id: string;
  ticker: string;
  transaction_date: string;   // "YYYY-MM-DD"
  insider_name: string;
  title: string | null;       // "VD", "CFO", etc.
  transaction_type: "buy" | "sell" | "exercise" | "other";
  shares: number | null;
  value_sek: number | null;
  source: "yahoo" | "fi";
}

// --- Stock Details ---

export interface StockDetails {
  ticker: string;
  name: string;
  price: number;
  currency: string;
  exchange_rate: number;
  price_sek: number;
  change_percent: number;
  pe_ratio: number | null;
  market_cap: number | null;
  week52_high: number | null;
  week52_low: number | null;
  volume: number | null;
  history: { date: string; close: number }[];
  owners: { team_id: string; team_name: string; shares: number }[];
  recent_trades: Trade[];
}

// --- Trade History ---

export interface TradeHistoryEntry extends Trade {
  realized_pnl_sek: number | null;
}

// --- Watchlist ---

export interface WatchlistItem {
  id: string;
  profile_id: string;
  ticker: string;
  stock_name: string | null;
  added_at: string;
}

// --- Comparison Chart ---

export interface ComparisonTeam {
  team_id: string;
  team_name: string;
  snapshots: { date: string; value: number; return_percent: number }[];
}

export interface BenchmarkData {
  name: string;
  snapshots: { date: string; return_percent: number }[];
}

export interface ComparisonData {
  teams: ComparisonTeam[];
  benchmark: BenchmarkData;
  start_value: number;
  my_team_id: string;
}

// --- Season Ranking ---

export interface SeasonScore {
  id: string;
  team_id: string;
  competition_id: string;
  final_rank: number;
  final_value: number;
  final_return_percent: number;
  points: number;
}

export interface SeasonRankingEntry {
  team_id: string;
  team_name: string;
  total_points: number;
  wins: number;
  podiums: number;
  competitions: number;
  avg_rank: number;
}
