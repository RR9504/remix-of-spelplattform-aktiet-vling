import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompetition } from "@/contexts/CompetitionContext";

interface JoinCompetitionDialogProps {
  competition: {
    id: string;
    name: string;
    initial_balance: number;
  };
  onClose: () => void;
  onJoined: () => void;
}

interface TeamOption {
  id: string;
  name: string;
  alreadyJoined: boolean;
}

export function JoinCompetitionDialog({ competition, onClose, onJoined }: JoinCompetitionDialogProps) {
  const { user } = useAuth();
  const { refresh } = useCompetition();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchTeams = async () => {
      // Get user's teams
      const { data: memberRows } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("profile_id", user.id);

      const teamIds = (memberRows || []).map((r) => r.team_id);
      if (teamIds.length === 0) {
        setTeams([]);
        setLoading(false);
        return;
      }

      const { data: teamData } = await supabase
        .from("teams")
        .select("id, name")
        .in("id", teamIds);

      // Check which teams are already in this competition
      const { data: existing } = await supabase
        .from("competition_teams")
        .select("team_id")
        .eq("competition_id", competition.id)
        .in("team_id", teamIds);

      const joinedSet = new Set((existing || []).map((r: any) => r.team_id));

      setTeams(
        (teamData || []).map((t: any) => ({
          id: t.id,
          name: t.name,
          alreadyJoined: joinedSet.has(t.id),
        }))
      );
      setLoading(false);
    };

    fetchTeams();
  }, [user, competition.id]);

  const handleJoin = async (teamId: string) => {
    setJoining(true);
    const { error } = await supabase.from("competition_teams").insert({
      competition_id: competition.id,
      team_id: teamId,
      cash_balance_sek: competition.initial_balance,
    });

    if (error) {
      if (error.message.includes("duplicate")) {
        toast.error("Laget är redan med i denna tävling.");
      } else {
        toast.error("Kunde inte gå med: " + error.message);
      }
    } else {
      toast.success(`Gick med i ${competition.name}!`);
      await refresh();
      onJoined();
      navigate("/");
    }
    setJoining(false);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gå med i {competition.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Välj ett av dina lag att anmäla:</p>

          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">Du har inga lag ännu.</p>
              <Button variant="outline" onClick={() => { onClose(); navigate("/onboarding"); }}>
                Skapa ett lag
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{team.name}</span>
                  </div>
                  {team.alreadyJoined ? (
                    <span className="text-xs text-muted-foreground">Redan med</span>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleJoin(team.id)}
                      disabled={joining}
                    >
                      {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : "Välj"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
