import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Trophy, Users, UserPlus, ArrowLeft, ArrowRight, Copy, Check } from "lucide-react";
import { toast } from "sonner";

type Path = "choose" | "competition" | "create-team" | "join-team";

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [path, setPath] = useState<Path>("choose");

  // Competition form
  const [compName, setCompName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [balance, setBalance] = useState("1000000");

  // Team form
  const [teamName, setTeamName] = useState("");
  const [competitionId, setCompetitionId] = useState("");

  // Join form
  const [inviteCode, setInviteCode] = useState("");

  const [loading, setLoading] = useState(false);

  const progress = path === "choose" ? 33 : 66;

  const handleCreateCompetition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const { error } = await supabase.from("competitions").insert({
      name: compName,
      start_date: startDate,
      end_date: endDate,
      initial_balance: Number(balance),
      created_by: user.id,
    });

    if (error) {
      toast.error("Kunde inte skapa tävlingen: " + error.message);
    } else {
      toast.success("Tävling skapad!");
      navigate("/");
    }
    setLoading(false);
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("teams")
      .insert({
        name: teamName,
        captain_id: user.id,
        competition_id: competitionId || null,
      })
      .select()
      .single();

    if (error) {
      toast.error("Kunde inte skapa laget: " + error.message);
    } else {
      // Also add captain as team member
      await supabase.from("team_members").insert({
        team_id: data.id,
        profile_id: user.id,
      });
      toast.success("Lag skapat!");
      navigate("/team/" + data.id);
    }
    setLoading(false);
  };

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    // Find team by invite code
    const { data: team, error: findError } = await supabase
      .from("teams")
      .select("id, name")
      .eq("invite_code", inviteCode.trim())
      .single();

    if (findError || !team) {
      toast.error("Ingen lag hittades med den koden.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("team_members").insert({
      team_id: team.id,
      profile_id: user.id,
    });

    if (error) {
      if (error.message.includes("duplicate")) {
        toast.error("Du är redan med i detta lag.");
      } else {
        toast.error("Kunde inte gå med: " + error.message);
      }
    } else {
      toast.success(`Du gick med i ${team.name}!`);
      navigate("/team/" + team.id);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold tracking-tight">StockArena</span>
          </div>
          <p className="text-muted-foreground text-sm">Välkommen! Vad vill du göra?</p>
        </div>

        <Progress value={progress} className="h-2" />

        {path === "choose" && (
          <div className="grid gap-4">
            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => setPath("competition")}
            >
              <CardHeader className="flex flex-row items-center gap-4 pb-2">
                <div className="rounded-lg bg-primary/10 p-3">
                  <Trophy className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Starta en ny tävling</CardTitle>
                  <CardDescription>Bli admin och bjud in lag</CardDescription>
                </div>
              </CardHeader>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => setPath("create-team")}
            >
              <CardHeader className="flex flex-row items-center gap-4 pb-2">
                <div className="rounded-lg bg-primary/10 p-3">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Skapa ett lag</CardTitle>
                  <CardDescription>Bli lagkapten och bjud in vänner</CardDescription>
                </div>
              </CardHeader>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => setPath("join-team")}
            >
              <CardHeader className="flex flex-row items-center gap-4 pb-2">
                <div className="rounded-lg bg-primary/10 p-3">
                  <UserPlus className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Gå med i ett lag</CardTitle>
                  <CardDescription>Använd en inbjudningskod</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </div>
        )}

        {path === "competition" && (
          <Card>
            <CardHeader>
              <CardTitle>Starta en ny tävling</CardTitle>
              <CardDescription>Ange detaljer för din tävling</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateCompetition} className="space-y-4">
                <div className="space-y-2">
                  <Label>Tävlingsnamn</Label>
                  <Input
                    placeholder="Vår-tävlingen 2024"
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Startdatum</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Slutdatum</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Startkapital (SEK)</Label>
                  <Input
                    type="number"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setPath("choose")}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Tillbaka
                  </Button>
                  <Button type="submit" className="flex-1" disabled={loading}>
                    {loading ? "Skapar..." : "Skapa tävling"} <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {path === "create-team" && (
          <Card>
            <CardHeader>
              <CardTitle>Skapa ett lag</CardTitle>
              <CardDescription>Välj ett unikt lagnamn</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateTeam} className="space-y-4">
                <div className="space-y-2">
                  <Label>Lagnamn</Label>
                  <Input
                    placeholder="Börshajarna"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setPath("choose")}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Tillbaka
                  </Button>
                  <Button type="submit" className="flex-1" disabled={loading}>
                    {loading ? "Skapar..." : "Skapa lag"} <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {path === "join-team" && (
          <Card>
            <CardHeader>
              <CardTitle>Gå med i ett lag</CardTitle>
              <CardDescription>Skriv in inbjudningskoden du fått</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleJoinTeam} className="space-y-4">
                <div className="space-y-2">
                  <Label>Inbjudningskod</Label>
                  <Input
                    placeholder="abc12345"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setPath("choose")}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Tillbaka
                  </Button>
                  <Button type="submit" className="flex-1" disabled={loading}>
                    {loading ? "Söker..." : "Gå med"} <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
