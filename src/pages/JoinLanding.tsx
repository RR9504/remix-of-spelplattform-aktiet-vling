import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompetition } from "@/contexts/CompetitionContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Users, Trophy } from "lucide-react";
import { toast } from "sonner";

export default function JoinLanding() {
  const { type, code } = useParams<{ type: string; code: string }>();
  const { user, loading: authLoading } = useAuth();
  const { teams, refresh } = useCompetition();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [target, setTarget] = useState<{ name: string; id: string; extra?: string; initialBalance?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      sessionStorage.setItem("joinRedirect", window.location.pathname);
      navigate("/auth");
      return;
    }
    fetchTarget();
  }, [user, authLoading, type, code]);

  // Auto-select first team when teams load
  useEffect(() => {
    if (teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams]);

  const fetchTarget = async () => {
    if (!code || !type) {
      setError("Ogiltig länk");
      setLoading(false);
      return;
    }

    setLoading(true);

    if (type === "team") {
      const { data: team } = await supabase
        .from("teams")
        .select("id, name")
        .eq("invite_code", code)
        .single();

      if (!team) {
        setError("Lag hittades inte med denna kod");
      } else {
        setTarget({ name: team.name, id: team.id });
      }
    } else if (type === "competition") {
      const { data: comp } = await supabase
        .from("competitions")
        .select("id, name, start_date, end_date, initial_balance")
        .eq("invite_code", code)
        .single();

      if (!comp) {
        setError("Tävling hittades inte med denna kod");
      } else {
        const compData = comp as any;
        setTarget({
          name: compData.name,
          id: compData.id,
          extra: `${compData.start_date} – ${compData.end_date}`,
          initialBalance: compData.initial_balance,
        });
      }
    } else {
      setError("Ogiltig länktyp");
    }

    setLoading(false);
  };

  const handleJoin = async () => {
    if (!user || !target) return;
    setJoining(true);

    try {
      if (type === "team") {
        const { error: joinError } = await supabase
          .from("team_members")
          .insert({ team_id: target.id, profile_id: user.id });

        if (joinError) {
          if (joinError.message.includes("duplicate")) {
            toast.info("Du är redan medlem i detta lag");
          } else {
            toast.error("Kunde inte gå med: " + joinError.message);
            setJoining(false);
            return;
          }
        } else {
          toast.success(`Du gick med i ${target.name}!`);
        }
        await refresh();
        navigate(`/team/${target.id}`);
      } else if (type === "competition") {
        if (teams.length === 0) {
          toast.error("Du behöver skapa eller gå med i ett lag först.");
          navigate("/onboarding");
          setJoining(false);
          return;
        }

        const teamId = selectedTeamId || teams[0].id;
        const { error: joinError } = await supabase.from("competition_teams").insert({
          competition_id: target.id,
          team_id: teamId,
          cash_balance_sek: target.initialBalance,
        });

        if (joinError) {
          if (joinError.message.includes("duplicate")) {
            toast.error("Ditt lag är redan med i denna tävling.");
          } else {
            toast.error("Kunde inte gå med: " + joinError.message);
          }
        } else {
          toast.success(`Gick med i ${target.name}!`);
          await refresh();
          navigate("/");
        }
      }
    } catch {
      toast.error("Ett fel uppstod");
    }

    setJoining(false);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CardTitle>Ogiltig länk</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => navigate("/")}>Gå till Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {type === "team" ? (
              <Users className="h-12 w-12 text-primary" />
            ) : (
              <Trophy className="h-12 w-12 text-primary" />
            )}
          </div>
          <CardTitle>
            {type === "team" ? "Gå med i lag" : "Gå med i tävling"}
          </CardTitle>
          <CardDescription>
            Du har blivit inbjuden till <strong>{target?.name}</strong>
          </CardDescription>
          {target?.extra && (
            <p className="text-sm text-muted-foreground mt-1">{target.extra}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {type === "competition" && teams.length > 1 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Välj lag att tävla med:</p>
              <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj lag" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {type === "competition" && teams.length === 0 && (
            <p className="text-sm text-muted-foreground text-center">
              Du behöver skapa eller gå med i ett lag innan du kan tävla.
            </p>
          )}
          <Button
            onClick={handleJoin}
            className="w-full"
            disabled={joining || (type === "competition" && teams.length === 0)}
          >
            {joining ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {joining ? "Går med..." : "Gå med"}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => navigate("/")}>
            Avbryt
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
