import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompetition } from "@/contexts/CompetitionContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, Trophy } from "lucide-react";
import { toast } from "sonner";

export default function JoinLanding() {
  const { type, code } = useParams<{ type: string; code: string }>();
  const { user, loading: authLoading } = useAuth();
  const { refresh } = useCompetition();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [target, setTarget] = useState<{ name: string; id: string; extra?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // Save the join URL and redirect to auth
      sessionStorage.setItem("joinRedirect", window.location.pathname);
      navigate("/auth");
      return;
    }
    fetchTarget();
  }, [user, authLoading, type, code]);

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
        .select("id, name, start_date, end_date")
        .eq("invite_code", code)
        .single();

      if (!comp) {
        setError("Tävling hittades inte med denna kod");
      } else {
        setTarget({
          name: comp.name,
          id: comp.id,
          extra: `${comp.start_date} – ${comp.end_date}`,
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
        // Join team
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
        // For competitions, redirect to competitions page
        toast.info("Gå med i tävlingen via tävlingssidan");
        await refresh();
        navigate("/competitions");
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
          <Button onClick={handleJoin} className="w-full" disabled={joining}>
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
