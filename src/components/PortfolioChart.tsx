import { useState, useEffect } from "react";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatSEK } from "@/lib/mockData";
import { getPortfolioHistory, getComparisonData } from "@/lib/api";
import { useCompetition } from "@/contexts/CompetitionContext";
import type { ComparisonData } from "@/types/trading";

interface PortfolioChartProps {
  currentValue?: number;
  startValue?: number;
}

const TEAM_COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(280, 67%, 50%)",
  "hsl(45, 93%, 47%)",
  "hsl(140, 71%, 45%)",
  "hsl(330, 80%, 55%)",
  "hsl(200, 80%, 55%)",
];

const MY_TEAM_COLOR = "hsl(174, 72%, 46%)";
const BENCHMARK_COLOR = "hsl(30, 90%, 55%)";

export function PortfolioChart({ currentValue, startValue: propStartValue }: PortfolioChartProps) {
  const { activeCompetition, activeTeam } = useCompetition();
  const [data, setData] = useState<{ date: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"mine" | "compare">("mine");
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [visibleTeams, setVisibleTeams] = useState<Set<string>>(new Set());

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

      // Always ensure at least two points so we get a line, not a dot
      const startLabel = activeCompetition.start_date
        ? new Date(activeCompetition.start_date).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })
        : "Start";
      const todayLabel = new Date().toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
      const current = currentValue ?? startValue;

      if (chartData.length === 0) {
        // No snapshots at all — show start → today
        chartData.push({ date: startLabel, value: startValue });
        if (startLabel !== todayLabel) {
          chartData.push({ date: todayLabel, value: current });
        } else {
          chartData.push({ date: "Nu", value: current });
        }
      } else if (chartData.length === 1) {
        // Only one snapshot — prepend start or append today
        const existing = chartData[0];
        if (existing.date !== startLabel) {
          chartData.unshift({ date: startLabel, value: startValue });
        }
        if (existing.date !== todayLabel) {
          chartData.push({ date: todayLabel, value: current });
        }
      }

      // Always append current value as last point if snapshots are stale
      const lastEntry = chartData[chartData.length - 1];
      if (lastEntry.date !== todayLabel && lastEntry.date !== "Nu") {
        chartData.push({ date: todayLabel, value: current });
      }

      setData(chartData);
      setLoading(false);
    });
  }, [activeCompetition?.id, activeTeam?.id]);

  useEffect(() => {
    if (mode === "compare" && !comparisonData && activeCompetition && activeTeam) {
      setComparisonLoading(true);
      getComparisonData(activeCompetition.id, activeTeam.id).then((data) => {
        setComparisonData(data);
        if (data) {
          // Show all teams + benchmark by default
          const ids = new Set(data.teams.map((t) => t.team_id));
          ids.add("benchmark");
          setVisibleTeams(ids);
        }
        setComparisonLoading(false);
      });
    }
  }, [mode, activeCompetition?.id, activeTeam?.id]);

  const toggleTeam = (id: string) => {
    setVisibleTeams((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Build comparison chart data
  const comparisonChartData = (() => {
    if (!comparisonData) return [];

    // Collect all unique dates
    const dateSet = new Set<string>();
    for (const team of comparisonData.teams) {
      for (const s of team.snapshots) {
        dateSet.add(s.date);
      }
    }
    for (const s of comparisonData.benchmark.snapshots) {
      dateSet.add(s.date);
    }

    const dates = Array.from(dateSet).sort();

    return dates.map((date) => {
      const point: Record<string, string | number> = {
        date: new Date(date).toLocaleDateString("sv-SE", { day: "numeric", month: "short" }),
      };

      for (const team of comparisonData.teams) {
        const snapshot = team.snapshots.find((s) => s.date === date);
        if (snapshot) {
          point[team.team_id] = snapshot.return_percent;
        }
      }

      const benchSnapshot = comparisonData.benchmark.snapshots.find((s) => s.date === date);
      if (benchSnapshot) {
        point["benchmark"] = benchSnapshot.return_percent;
      }

      return point;
    });
  })();

  const getTeamColor = (teamId: string) => {
    if (!comparisonData) return TEAM_COLORS[0];
    if (teamId === comparisonData.my_team_id) return MY_TEAM_COLOR;
    const otherTeams = comparisonData.teams.filter((t) => t.team_id !== comparisonData.my_team_id);
    const idx = otherTeams.findIndex((t) => t.team_id === teamId);
    return TEAM_COLORS[idx % TEAM_COLORS.length];
  };

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
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border p-0.5">
            <Button
              variant={mode === "mine" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMode("mine")}
            >
              Mitt lag
            </Button>
            <Button
              variant={mode === "compare" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMode("compare")}
            >
              Jämför
            </Button>
          </div>
          {mode === "mine" && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Startkapital</p>
              <p className="text-sm font-mono text-muted-foreground">{formatSEK(startValue)}</p>
            </div>
          )}
        </div>
      </div>

      <div className="h-[250px] w-full">
        {(loading || (mode === "compare" && comparisonLoading)) ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : mode === "mine" ? (
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
        ) : comparisonData && comparisonChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={comparisonChartData}>
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
                tickFormatter={(v) => `${v.toFixed(0)}%`}
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
                formatter={(value: number, name: string) => {
                  const team = comparisonData.teams.find((t) => t.team_id === name);
                  const label = name === "benchmark"
                    ? comparisonData.benchmark.name
                    : team?.team_name || name;
                  return [`${value.toFixed(2)}%`, label];
                }}
              />
              {comparisonData.teams.map((team) =>
                visibleTeams.has(team.team_id) ? (
                  <Line
                    key={team.team_id}
                    type="monotone"
                    dataKey={team.team_id}
                    stroke={getTeamColor(team.team_id)}
                    strokeWidth={team.team_id === comparisonData.my_team_id ? 3 : 1.5}
                    dot={false}
                    connectNulls
                    name={team.team_id}
                  />
                ) : null
              )}
              {visibleTeams.has("benchmark") && comparisonData.benchmark.snapshots.length > 0 && (
                <Line
                  type="monotone"
                  dataKey="benchmark"
                  stroke={BENCHMARK_COLOR}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  connectNulls
                  name="benchmark"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Ingen jämförelsedata tillgänglig
          </div>
        )}
      </div>

      {/* Comparison legend with toggles */}
      {mode === "compare" && comparisonData && (
        <div className="mt-4 flex flex-wrap gap-2">
          {comparisonData.teams.map((team) => {
            const color = getTeamColor(team.team_id);
            const isVisible = visibleTeams.has(team.team_id);
            const isMyTeam = team.team_id === comparisonData.my_team_id;
            return (
              <button
                key={team.team_id}
                onClick={() => toggleTeam(team.team_id)}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-opacity ${
                  isVisible ? "opacity-100" : "opacity-40"
                }`}
              >
                <span
                  className="inline-block h-2 w-4 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                <span className={isMyTeam ? "font-semibold" : ""}>
                  {team.team_name}{isMyTeam ? " (du)" : ""}
                </span>
              </button>
            );
          })}
          {comparisonData.benchmark.snapshots.length > 0 && (
            <button
              onClick={() => toggleTeam("benchmark")}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-opacity ${
                visibleTeams.has("benchmark") ? "opacity-100" : "opacity-40"
              }`}
            >
              <span
                className="inline-block h-2 w-4 rounded-sm"
                style={{
                  backgroundColor: BENCHMARK_COLOR,
                  backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 3px, hsl(222, 25%, 9%) 3px, hsl(222, 25%, 9%) 5px)",
                }}
              />
              <span>{comparisonData.benchmark.name}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
