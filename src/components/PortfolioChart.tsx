import { useState, useEffect } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2 } from "lucide-react";
import { formatSEK } from "@/lib/mockData";
import { getPortfolioHistory } from "@/lib/api";
import { useCompetition } from "@/contexts/CompetitionContext";

interface PortfolioChartProps {
  currentValue?: number;
  startValue?: number;
}

export function PortfolioChart({ currentValue, startValue: propStartValue }: PortfolioChartProps) {
  const { activeCompetition, activeTeam } = useCompetition();
  const [data, setData] = useState<{ date: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const startValue = propStartValue ?? activeCompetition?.initial_balance ?? 1_000_000;
  const displayValue = currentValue ?? (data.length > 0 ? data[data.length - 1].value : startValue);
  const returnAmount = displayValue - startValue;
  const returnPercent = startValue > 0 ? ((returnAmount / startValue) * 100).toFixed(2) : "0.00";
  const isPositive = returnAmount >= 0;

  useEffect(() => {
    if (!activeCompetition || !activeTeam) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getPortfolioHistory(activeCompetition.id, activeTeam.id).then((snapshots) => {
      const chartData = snapshots.map((s) => ({
        date: new Date(s.snapshot_date).toLocaleDateString("sv-SE", { day: "numeric", month: "short" }),
        value: s.total_value_sek,
      }));
      // If no snapshots yet, show a single point at start capital
      if (chartData.length === 0) {
        chartData.push({
          date: "Idag",
          value: startValue,
        });
      }
      setData(chartData);
      setLoading(false);
    });
  }, [activeCompetition?.id, activeTeam?.id]);

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Portföljvärde</p>
          <p className="text-3xl font-bold font-mono tracking-tight">{formatSEK(displayValue)}</p>
          <p className={`text-sm font-medium mt-1 ${isPositive ? "text-gain" : "text-loss"}`}>
            {isPositive ? "+" : ""}
            {formatSEK(returnAmount)} ({isPositive ? "+" : ""}
            {returnPercent}%)
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Startkapital</p>
          <p className="text-sm font-mono text-muted-foreground">{formatSEK(startValue)}</p>
        </div>
      </div>
      <div className="h-[250px] w-full">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(174, 72%, 46%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(174, 72%, 46%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "hsl(215, 15%, 55%)" }}
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "hsl(215, 15%, 55%)" }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                domain={["auto", "auto"]}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(222, 25%, 9%)",
                  border: "1px solid hsl(222, 18%, 16%)",
                  borderRadius: "8px",
                  color: "hsl(210, 20%, 92%)",
                  fontSize: "13px",
                }}
                formatter={(value: number) => [formatSEK(value), "Värde"]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(174, 72%, 46%)"
                strokeWidth={2}
                fill="url(#chartGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
