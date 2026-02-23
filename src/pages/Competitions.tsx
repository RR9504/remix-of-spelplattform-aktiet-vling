import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Users, Calendar, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatSEK } from "@/lib/mockData";
import { JoinCompetitionDialog } from "@/components/JoinCompetitionDialog";

interface Competition {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  initial_balance: number;
  max_teams: number | null;
  is_public: boolean;
  team_count?: number;
}

type Filter = "upcoming" | "active" | "ended" | "all";

export default function Competitions() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [joining, setJoining] = useState<Competition | null>(null);

  useEffect(() => {
    fetchCompetitions();
  }, []);

  const fetchCompetitions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("competitions")
      .select("id, name, description, start_date, end_date, initial_balance, max_teams, is_public")
      .eq("is_public", true)
      .order("start_date", { ascending: false });

    if (!error && data) {
      // Get team counts for each competition
      const comps = data as unknown as Competition[];
      for (const comp of comps) {
        const { count } = await supabase
          .from("competition_teams")
          .select("id", { count: "exact", head: true })
          .eq("competition_id", comp.id);
        comp.team_count = count ?? 0;
      }
      setCompetitions(comps);
    }
    setLoading(false);
  };

  const today = new Date().toISOString().split("T")[0];

  const getStatus = (comp: Competition) => {
    if (today < comp.start_date) return "upcoming";
    if (today > comp.end_date) return "ended";
    return "active";
  };

  const filtered = competitions.filter((c) => {
    if (filter !== "all" && getStatus(c) !== filter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Tävlingar</h1>
          <p className="text-muted-foreground text-sm">Hitta och gå med i offentliga tävlingar</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Sök tävling..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-card"
            />
          </div>
          <div className="flex gap-2">
            {(["all", "active", "upcoming", "ended"] as Filter[]).map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "Alla" : f === "active" ? "Aktiva" : f === "upcoming" ? "Kommande" : "Avslutade"}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Inga tävlingar hittades.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((comp) => {
              const status = getStatus(comp);
              return (
                <Card key={comp.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{comp.name}</CardTitle>
                      <Badge
                        variant={status === "active" ? "default" : "outline"}
                        className={
                          status === "active"
                            ? "bg-gain/20 text-gain border-gain/30"
                            : status === "upcoming"
                            ? "bg-primary/20 text-primary border-primary/30"
                            : ""
                        }
                      >
                        {status === "active" ? "Aktiv" : status === "upcoming" ? "Kommande" : "Avslutad"}
                      </Badge>
                    </div>
                    {comp.description && (
                      <CardDescription>{comp.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-between gap-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>{comp.start_date} – {comp.end_date}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>
                          {comp.team_count ?? 0} lag
                          {comp.max_teams ? ` / ${comp.max_teams}` : ""}
                        </span>
                      </div>
                      <div className="text-muted-foreground">
                        Startkapital: <span className="font-mono font-semibold text-foreground">{formatSEK(comp.initial_balance)}</span>
                      </div>
                    </div>
                    {status !== "ended" && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setJoining(comp)}
                        disabled={comp.max_teams !== null && (comp.team_count ?? 0) >= comp.max_teams}
                      >
                        Gå med
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {joining && (
        <JoinCompetitionDialog
          competition={joining}
          onClose={() => setJoining(null)}
          onJoined={() => {
            setJoining(null);
            fetchCompetitions();
          }}
        />
      )}
    </div>
  );
}
