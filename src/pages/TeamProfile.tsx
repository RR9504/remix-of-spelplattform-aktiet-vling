import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Navbar } from "@/components/Navbar";
import { AchievementShowcase } from "@/components/AchievementShowcase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Crown, Users } from "lucide-react";
import { formatSEK } from "@/lib/mockData";
import { getTeamProfile } from "@/lib/api";
import { useCompetition } from "@/contexts/CompetitionContext";

const TeamProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const { activeCompetition } = useCompetition();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getTeamProfile(id, activeCompetition?.id).then((data) => {
      setProfile(data);
      setLoading(false);
    });
  }, [id, activeCompetition?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container py-6 pb-20 md:pb-6 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container py-6 pb-20 md:pb-6">
          <p className="text-muted-foreground text-center py-16">Lag hittades inte</p>
        </main>
      </div>
    );
  }

  const chartData = (profile.snapshots || []).map((s: any) => ({
    date: new Date(s.snapshot_date).toLocaleDateString("sv-SE", { day: "numeric", month: "short" }),
    value: s.total_value_sek,
  }));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 pb-20 md:pb-6 space-y-6">
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{profile.team.name}</h1>
            <p className="text-muted-foreground text-sm">
              {profile.members.length} {profile.members.length === 1 ? "medlem" : "medlemmar"}
            </p>
          </div>
        </div>

        {/* Members */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Medlemmar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.members.map((m: any) => (
                <div key={m.profile_id} className="flex items-center gap-1.5 rounded-full border px-3 py-1.5">
                  <span className="text-sm">{m.name}</span>
                  {m.is_captain && <Crown className="h-3 w-3 text-primary" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Value Chart */}
        {chartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Värdeutveckling</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="profileGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(174, 72%, 46%)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(174, 72%, 46%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(215, 15%, 55%)" }} interval="preserveStartEnd" />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(215, 15%, 55%)" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} domain={["auto", "auto"]} width={50} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(222, 25%, 9%)", border: "1px solid hsl(222, 18%, 16%)", borderRadius: "8px", color: "hsl(210, 20%, 92%)", fontSize: "13px" }} formatter={(value: number) => [formatSEK(value), "Värde"]} />
                    <Area type="monotone" dataKey="value" stroke="hsl(174, 72%, 46%)" strokeWidth={2} fill="url(#profileGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Holdings (if visible) */}
        {profile.holdings && profile.holdings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Innehav</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {profile.holdings.map((h: any) => (
                  <div key={h.ticker} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <span className="font-mono font-semibold text-sm">{h.ticker}</span>
                      <p className="text-xs text-muted-foreground">{h.stock_name}</p>
                    </div>
                    <span className="font-mono text-sm">{Number(h.total_shares)} st</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Achievements */}
        {profile.members.map((m: any) => (
          <div key={m.profile_id}>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">{m.name}</h3>
            <AchievementShowcase profileId={m.profile_id} />
          </div>
        ))}
      </main>
    </div>
  );
};

export default TeamProfilePage;
