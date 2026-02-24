import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { AlertTriangle } from "lucide-react";
import { formatSEK } from "@/lib/mockData";
import type { Holding, ShortPosition } from "@/types/trading";

interface PortfolioDiversificationProps {
  holdings: Holding[];
  shortPositions?: ShortPosition[];
  cash?: number;
}

const COLORS = [
  "hsl(174, 72%, 46%)",
  "hsl(217, 91%, 60%)",
  "hsl(280, 67%, 50%)",
  "hsl(45, 93%, 47%)",
  "hsl(0, 72%, 51%)",
  "hsl(140, 71%, 45%)",
  "hsl(330, 80%, 55%)",
  "hsl(200, 80%, 55%)",
];

const SHORT_COLOR = "hsl(0, 60%, 44%)";
const CASH_COLOR = "hsl(222, 15%, 40%)";

export function PortfolioDiversification({ holdings, shortPositions, cash }: PortfolioDiversificationProps) {
  const hasHoldings = holdings.length > 0;
  const hasShorts = shortPositions && shortPositions.length > 0;

  if (!hasHoldings && !hasShorts) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center">
        <p className="text-muted-foreground text-sm">
          Inga innehav att visa. Börja handla för att se fördelningen.
        </p>
      </div>
    );
  }

  // Long positions
  const longData = holdings
    .filter((h) => h.market_value_sek && h.market_value_sek > 0)
    .map((h) => ({
      name: h.ticker,
      value: h.market_value_sek!,
      type: "long" as const,
    }))
    .sort((a, b) => b.value - a.value);

  // Short positions (use absolute value for chart sizing)
  const shortData = (shortPositions || [])
    .filter((sp) => sp.shares > 0 && sp.current_price_sek)
    .map((sp) => ({
      name: `${sp.ticker} (SHORT)`,
      value: sp.shares * (sp.current_price_sek ?? sp.entry_price_sek),
      type: "short" as const,
    }))
    .sort((a, b) => b.value - a.value);

  // Cash
  const cashEntry = cash && cash > 0 ? [{ name: "Likvida medel", value: cash, type: "cash" as const }] : [];

  const allData = [...longData, ...shortData, ...cashEntry];
  const totalPortfolioValue = allData.reduce((sum, d) => sum + d.value, 0);

  const dataWithPercent = allData.map((d) => ({
    ...d,
    percent: totalPortfolioValue > 0 ? (d.value / totalPortfolioValue) * 100 : 0,
  }));

  const longTotal = longData.reduce((sum, d) => sum + d.value, 0);
  const shortTotal = shortData.reduce((sum, d) => sum + d.value, 0);

  const concentrated = dataWithPercent.find((d) => d.type === "long" && d.percent > 50);

  const getColor = (entry: typeof dataWithPercent[number], index: number) => {
    if (entry.type === "short") return SHORT_COLOR;
    if (entry.type === "cash") return CASH_COLOR;
    const longIndex = longData.findIndex((d) => d.name === entry.name);
    return COLORS[longIndex % COLORS.length];
  };

  return (
    <div className="rounded-xl border bg-card p-6">
      <h2 className="text-lg font-semibold mb-4">Portföljfördelning</h2>

      {concentrated && (
        <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 mb-4">
          <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
          <p className="text-sm text-yellow-500">
            Hög koncentration: {concentrated.name} utgör {concentrated.percent.toFixed(0)}% av portföljen
          </p>
        </div>
      )}

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={dataWithPercent}
              cx="50%"
              cy="50%"
              outerRadius={100}
              innerRadius={60}
              dataKey="value"
              label={({ name, percent }) => `${name} ${percent.toFixed(0)}%`}
              labelLine={false}
            >
              {dataWithPercent.map((entry, i) => (
                <Cell key={i} fill={getColor(entry, i)} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => formatSEK(value)}
              contentStyle={{
                backgroundColor: "hsl(222, 25%, 9%)",
                border: "1px solid hsl(222, 18%, 16%)",
                borderRadius: "8px",
                color: "hsl(210, 20%, 92%)",
                fontSize: "13px",
              }}
            />
            <Legend
              formatter={(value: string) => {
                const item = dataWithPercent.find((d) => d.name === value);
                return `${value} (${item?.percent.toFixed(1)}%)`;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex justify-center gap-6 text-sm text-muted-foreground">
        <div>
          Långa: <span className="font-mono font-semibold text-foreground">{formatSEK(longTotal)}</span>
        </div>
        {shortTotal > 0 && (
          <div>
            Blankade: <span className="font-mono font-semibold text-loss">{formatSEK(shortTotal)}</span>
          </div>
        )}
        {cash !== undefined && cash > 0 && (
          <div>
            Likvida: <span className="font-mono font-semibold text-foreground">{formatSEK(cash)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
