// Mock data for the stock simulator

export interface Stock {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  market: 'SE' | 'US';
  currency: 'SEK' | 'USD';
}

export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  avgPrice: number;
  currentPrice: number;
  market: 'SE' | 'US';
  currency: 'SEK' | 'USD';
}

export interface Team {
  name: string;
  totalValue: number;
  startValue: number;
  returnPercent: number;
  returnAmount: number;
  members: string[];
}


export const mockStocks: Stock[] = [
  { ticker: 'VOLV-B', name: 'Volvo B', price: 268.40, change: 3.20, changePercent: 1.21, market: 'SE', currency: 'SEK' },
  { ticker: 'ERIC-B', name: 'Ericsson B', price: 82.50, change: -1.10, changePercent: -1.32, market: 'SE', currency: 'SEK' },
  { ticker: 'HM-B', name: 'H&M B', price: 165.80, change: 2.50, changePercent: 1.53, market: 'SE', currency: 'SEK' },
  { ticker: 'SEB-A', name: 'SEB A', price: 148.20, change: 0.80, changePercent: 0.54, market: 'SE', currency: 'SEK' },
  { ticker: 'AAPL', name: 'Apple Inc.', price: 189.84, change: 2.34, changePercent: 1.25, market: 'US', currency: 'USD' },
  { ticker: 'MSFT', name: 'Microsoft', price: 415.50, change: -3.20, changePercent: -0.76, market: 'US', currency: 'USD' },
  { ticker: 'NVDA', name: 'NVIDIA', price: 875.30, change: 15.60, changePercent: 1.81, market: 'US', currency: 'USD' },
  { ticker: 'TSLA', name: 'Tesla Inc.', price: 248.42, change: -5.30, changePercent: -2.09, market: 'US', currency: 'USD' },
  { ticker: 'AMZN', name: 'Amazon', price: 178.25, change: 1.75, changePercent: 0.99, market: 'US', currency: 'USD' },
  { ticker: 'SAND', name: 'Sandvik', price: 215.60, change: -0.40, changePercent: -0.19, market: 'SE', currency: 'SEK' },
];

export const mockHoldings: Holding[] = [
  { ticker: 'VOLV-B', name: 'Volvo B', shares: 500, avgPrice: 255.00, currentPrice: 268.40, market: 'SE', currency: 'SEK' },
  { ticker: 'AAPL', name: 'Apple Inc.', shares: 50, avgPrice: 175.00, currentPrice: 189.84, market: 'US', currency: 'USD' },
  { ticker: 'NVDA', name: 'NVIDIA', shares: 20, avgPrice: 800.00, currentPrice: 875.30, market: 'US', currency: 'USD' },
  { ticker: 'HM-B', name: 'H&M B', shares: 300, avgPrice: 170.00, currentPrice: 165.80, market: 'SE', currency: 'SEK' },
];

export const mockTeams: Team[] = [
  { name: 'Börshajarna', totalValue: 1_085_300, startValue: 1_000_000, returnPercent: 8.53, returnAmount: 85_300, members: ['Anna', 'Erik'] },
  { name: 'Bull & Bear', totalValue: 1_062_100, startValue: 1_000_000, returnPercent: 6.21, returnAmount: 62_100, members: ['Sofia', 'Oscar'] },
  { name: 'Vinnarlaget', totalValue: 1_044_800, startValue: 1_000_000, returnPercent: 4.48, returnAmount: 44_800, members: ['Karl', 'Lisa'] },
  { name: 'Rocket Stocks', totalValue: 1_031_200, startValue: 1_000_000, returnPercent: 3.12, returnAmount: 31_200, members: ['Maja', 'Johan'] },
  { name: 'Diamond Hands', totalValue: 1_018_500, startValue: 1_000_000, returnPercent: 1.85, returnAmount: 18_500, members: ['Nils', 'Elin'] },
  { name: 'Stackarna', totalValue: 987_200, startValue: 1_000_000, returnPercent: -1.28, returnAmount: -12_800, members: ['David', 'Sara'] },
  { name: 'YOLO Traders', totalValue: 965_400, startValue: 1_000_000, returnPercent: -3.46, returnAmount: -34_600, members: ['Alex', 'Kim'] },
];

export const mockPortfolioHistory = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(2026, 1, i + 1).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }),
  value: 1_000_000 + Math.round((Math.sin(i / 5) * 30000 + i * 2800) + (Math.random() - 0.3) * 10000),
}));

export const weeklyRocket = {
  ticker: 'NVDA',
  name: 'NVIDIA',
  changePercent: 12.4,
  team: 'Börshajarna',
};

export const weeklyWinner = {
  team: 'Börshajarna',
  changePercent: 4.2,
};

export function formatSEK(value: number): string {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(value);
}

export function formatPrice(value: number, currency: string): string {
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
}

export function isMarketOpen(market: 'SE' | 'US'): boolean {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const time = hours * 60 + minutes;
  const day = now.getDay();
  
  if (day === 0 || day === 6) return false;
  
  if (market === 'SE') {
    return time >= 9 * 60 && time <= 17 * 60 + 25;  // 09:00–17:25 CET
  } else {
    return time >= 15 * 60 + 30 && time <= 22 * 60;  // 15:30–22:00 CET
  }
}
