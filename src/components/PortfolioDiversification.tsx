import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { AlertTriangle } from "lucide-react";
import { formatSEK } from "@/lib/mockData";
import type { Holding } from "@/types/trading";

interface PortfolioDiversificationProps {
  holdings: Holding[];
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

export function PortfolioDiversification({ holdings }: PortfolioDiversificationProps) {
  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center">
        <p className="text-muted-foreground text-sm">
          Inga innehav att visa. Börja handla för att se fördelningen.
        </p>
      </div>
    );
  }

  const totalValue = holdings.reduce((sum, h) => sum + (h.market_value_sek ?? 0), 0);

  const data = holdings
    .filter((h) => h.market_value_sek && h.market_value_sek > 0)
    .map((h) => ({
      name: h.ticker,
      value: h.market_value_sek!,
      percent: totalValue > 0 ? ((h.market_value_sek! / totalValue) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const concentrated = data.find((d) => d.percent > 50);

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
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={100}
              innerRadius={60}
              dataKey="value"
              label={({ name, percent }) => `${name} ${percent.toFixed(0)}%`}
              labelLine={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
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
                const item = data.find((d) => d.name === value);
                return `${value} (${item?.percent.toFixed(1)}%)`;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 text-sm text-muted-foreground text-center">
        Totalt aktievärde: <span className="font-mono font-semibold text-foreground">{formatSEK(totalValue)}</span>
      </div>
    </div>
  );
}
