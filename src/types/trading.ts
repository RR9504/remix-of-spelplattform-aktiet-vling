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
  side: "buy" | "sell";
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
  side: "buy" | "sell";
  shares: number;
  price_per_share: number;
  currency: string;
  exchange_rate: number;
  total_sek: number;
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
