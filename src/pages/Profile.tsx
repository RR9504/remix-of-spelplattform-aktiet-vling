import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompetition } from "@/contexts/CompetitionContext";
import { Navbar } from "@/components/Navbar";
import { CompetitionResults } from "@/components/CompetitionResults";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { User, Users, Trophy, Pencil, Check, LogOut, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { teams, allCompetitions: competitions, activeCompetition, activeTeam, setActiveCompetitionId, setActiveTeamId, refresh } = useCompetition();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [resultsComp, setResultsComp] = useState<typeof competitions[number] | null>(null);
  const [confirmDeleteTeam, setConfirmDeleteTeam] = useState<string | null>(null);
  const [deletingTeam, setDeletingTeam] = useState(false);

  // Map competition → team for this user
  const [compTeamMap, setCompTeamMap] = useState<Record<string, { team_id: string; team_name: string }>>({});

  useEffect(() => {
    if (!user) return;

    // Fetch profile
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (error) console.error("Profile fetch error:", error);
        if (data) {
          setFullName(data.full_name || "");
          setEmail(data.email || user.email || "");
        }
      });

    // Fetch competition_teams mappings for user's teams
    const teamIds = teams.map((t) => t.id);
    if (teamIds.length > 0) {
      supabase
        .from("competition_teams")
        .select("competition_id, team_id")
        .in("team_id", teamIds)
        .then(({ data, error }) => {
          if (error) console.error("Competition teams fetch error:", error);
          const map: Record<string, { team_id: string; team_name: string }> = {};
          for (const row of data || []) {
            const team = teams.find((t) => t.id === row.team_id);
            if (team) {
              map[row.competition_id] = { team_id: team.id, team_name: team.name };
            }
          }
          setCompTeamMap(map);
        });
    }
  }, [user, teams]);

  const handleSaveName = async () => {
    if (!user || !editName.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: editName.trim() })
      .eq("id", user.id);

    if (error) {
      toast.error("Kunde inte uppdatera namn");
    } else {
      setFullName(editName.trim());
      toast.success("Namn uppdaterat!");
      setEditing(false);
    }
    setSaving(false);
  };

  const handleSelectCompetition = (comp: typeof competitions[number]) => {
    const now = new Date();
    const end = new Date(comp.end_date);
    const isEnded = now > end;

    if (isEnded) {
      setResultsComp(comp);
      return;
    }

    setActiveCompetitionId(comp.id);
    const mapping = compTeamMap[comp.id];
    if (mapping) {
      setActiveTeamId(mapping.team_id);
    }
    navigate("/");
  };
  const displayName = fullName || email.split("@")[0] || "Användare";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 pb-28 md:pb-6 space-y-6 max-w-2xl">
        {/* User info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Min profil
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Namn</p>
              {editing ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-9"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                  />
                  <Button size="sm" onClick={handleSaveName} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Avbryt
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{displayName}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => { setEditName(fullName); setEditing(true); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">E-post</p>
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
          </CardContent>
        </Card>

        {/* Active competitions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Mina tävlingar
            </CardTitle>
            <CardDescription>Klicka för att byta aktiv tävling</CardDescription>
          </CardHeader>
          <CardContent>
            {competitions.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">Du är inte med i någon tävling ännu.</p>
                <Link to="/competitions">
                  <Button variant="outline" size="sm">Hitta tävlingar</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {competitions.map((comp) => {
                  const isActive = comp.id === activeCompetition?.id;
                  const mapping = compTeamMap[comp.id];
                  const now = new Date();
                  const start = new Date(comp.start_date);
                  const end = new Date(comp.end_date);
                  const isOngoing = now >= start && now <= end;
                  const isUpcoming = now < start;

                  return (
                    <button
                      key={comp.id}
                      onClick={() => handleSelectCompetition(comp)}
                      className={`w-full text-left rounded-lg border p-4 transition-colors ${
                        isActive
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{comp.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 break-words">
                            {mapping ? `Lag: ${mapping.team_name}` : ""}
                            {mapping ? " · " : ""}
                            {start.toLocaleDateString("sv-SE")} – {end.toLocaleDateString("sv-SE")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isOngoing && (
                            <Badge variant="outline" className="text-xs border-gain text-gain">Pågår</Badge>
                          )}
                          {isUpcoming && (
                            <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-500">Kommande</Badge>
                          )}
                          {!isOngoing && !isUpcoming && (
                            <Badge variant="outline" className="text-xs">Avslutad</Badge>
                          )}
                          {isActive && (
                            <Badge className="text-xs">Aktiv</Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Teams */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Mina lag
            </CardTitle>
          </CardHeader>
          <CardContent>
            {teams.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">Du är inte med i något lag ännu.</p>
                <Link to="/onboarding">
                  <Button variant="outline" size="sm">Skapa eller gå med i lag</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {teams.map((team) => (
                  <div
                    key={team.id}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <Link
                        to={`/team/${team.id}`}
                        className="flex-1 min-w-0 hover:text-primary transition-colors"
                      >
                        <span className="font-medium text-sm">{team.name}</span>
                      </Link>
                      {team.captain_id === user?.id && (
                        <Badge variant="outline" className="text-xs">Kapten</Badge>
                      )}
                    </div>
                    {team.captain_id === user?.id && (
                      confirmDeleteTeam === team.id ? (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="text-xs"
                            disabled={deletingTeam}
                            onClick={async () => {
                              setDeletingTeam(true);
                              const { error } = await supabase.from("teams").delete().eq("id", team.id);
                              if (error) {
                                toast.error("Kunde inte ta bort: " + error.message);
                              } else {
                                toast.success("Laget borttaget.");
                                await refresh();
                              }
                              setDeletingTeam(false);
                              setConfirmDeleteTeam(null);
                            }}
                          >
                            {deletingTeam ? <Loader2 className="h-3 w-3 animate-spin" /> : "Ja, ta bort laget"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => setConfirmDeleteTeam(null)}
                          >
                            Avbryt
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs text-destructive border-destructive/50 hover:bg-destructive/10"
                          onClick={() => setConfirmDeleteTeam(team.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          Ta bort lag
                        </Button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Logout */}
        <Button variant="outline" className="w-full" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Logga ut
        </Button>
      </main>

      {/* Results dialog for finished competitions */}
      <Dialog open={!!resultsComp} onOpenChange={(open) => { if (!open) setResultsComp(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Tävlingsresultat
            </DialogTitle>
          </DialogHeader>
          {resultsComp && (
            <CompetitionResults
              competitionId={resultsComp.id}
              competitionName={resultsComp.name}
              startDate={resultsComp.start_date}
              endDate={resultsComp.end_date}
              initialBalance={resultsComp.initial_balance}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
