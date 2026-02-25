import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompetition } from "@/contexts/CompetitionContext";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { User, Users, Trophy, Pencil, Check, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { teams, competitions, activeCompetition, activeTeam, setActiveCompetitionId, setActiveTeamId } = useCompetition();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

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
      .then(({ data }) => {
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
        .then(({ data }) => {
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

  const handleSelectCompetition = (compId: string) => {
    setActiveCompetitionId(compId);
    const mapping = compTeamMap[compId];
    if (mapping) {
      setActiveTeamId(mapping.team_id);
    }
    navigate("/");
  };

  const navigate = useNavigate();
  const displayName = fullName || email.split("@")[0] || "Användare";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 space-y-6 max-w-2xl">
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
                      onClick={() => handleSelectCompetition(comp.id)}
                      className={`w-full text-left rounded-lg border p-4 transition-colors ${
                        isActive
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm">{comp.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {mapping ? `Lag: ${mapping.team_name}` : ""}
                            {mapping ? " · " : ""}
                            {start.toLocaleDateString("sv-SE")} – {end.toLocaleDateString("sv-SE")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {isOngoing && (
                            <Badge variant="outline" className="text-[10px] border-gain text-gain">Pågår</Badge>
                          )}
                          {isUpcoming && (
                            <Badge variant="outline" className="text-[10px] border-yellow-500 text-yellow-500">Kommande</Badge>
                          )}
                          {!isOngoing && !isUpcoming && (
                            <Badge variant="outline" className="text-[10px]">Avslutad</Badge>
                          )}
                          {isActive && (
                            <Badge className="text-[10px]">Aktiv</Badge>
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
              <div className="space-y-2">
                {teams.map((team) => (
                  <Link
                    key={team.id}
                    to={`/team/${team.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <span className="font-medium text-sm">{team.name}</span>
                    {team.captain_id === user?.id && (
                      <Badge variant="outline" className="text-[10px]">Kapten</Badge>
                    )}
                  </Link>
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
    </div>
  );
}
