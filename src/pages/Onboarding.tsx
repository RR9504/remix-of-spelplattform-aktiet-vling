import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompetition } from "@/contexts/CompetitionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, Trophy, Users, ArrowLeft, ArrowRight, Copy, Check, Ticket, Search } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { toast } from "sonner";

type Path =
  | "choose"
  | "enter-code"
  | "create-team"
  | "team-created"
  | "competition"
  ;

export default function Onboarding() {
  const { user } = useAuth();
  const { refresh } = useCompetition();
  const navigate = useNavigate();
  const [path, setPath] = useState<Path>("choose");

  // Competition form
  const [compName, setCompName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [balance, setBalance] = useState("1000000");
  const [isPublic, setIsPublic] = useState(false);
  const [description, setDescription] = useState("");
  const [maxTeams, setMaxTeams] = useState("");

  // Team form
  const [teamName, setTeamName] = useState("");

  // Code input (auto-detect team or competition)
  const [code, setCode] = useState("");

  // Competition code on team-created step
  const [competitionCode, setCompetitionCode] = useState("");

  // State after team created/joined
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [currentTeamName, setCurrentTeamName] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const progress =
    path === "choose" ? 25
    : path === "team-created" ? 75
    : 50;

  const handleEnterCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const trimmed = code.trim();

    // Try team first
    const { data: team } = await supabase
      .from("teams")
      .select("id, name")
      .eq("invite_code", trimmed)
      .single();

    if (team) {
      // It's a team code — join the team
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
        await refresh();
        setCurrentTeamId(team.id);
        setCurrentTeamName(team.name);
        setPath("team-created");
      }
      setLoading(false);
      return;
    }

    // Try competition
    const { data: comp } = await supabase
      .from("competitions")
      .select("id, name, initial_balance")
      .eq("invite_code", trimmed)
      .single();

    if (comp) {
      // It's a competition code — need a team first
      const { data: memberRows } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("profile_id", user.id);

      const teamIds = (memberRows || []).map((r) => r.team_id);

      if (teamIds.length === 0) {
        toast.error("Du behöver skapa eller gå med i ett lag först.");
        setLoading(false);
        return;
      }

      const compData = comp as any;
      const { error } = await supabase.from("competition_teams").insert({
        competition_id: compData.id,
        team_id: teamIds[0],
        cash_balance_sek: compData.initial_balance,
      });

      if (error) {
        if (error.message.includes("duplicate")) {
          toast.error("Ditt lag är redan med i denna tävling.");
        } else {
          toast.error("Kunde inte gå med: " + error.message);
        }
      } else {
        toast.success(`Gick med i ${compData.name}!`);
        await refresh();
        navigate("/");
      }
      setLoading(false);
      return;
    }

    toast.error("Ingen lag eller tävling hittades med den koden.");
    setLoading(false);
  };

  const handleCreateCompetition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("competitions")
      .insert({
        name: compName,
        start_date: startDate,
        end_date: endDate,
        initial_balance: Number(balance),
        created_by: user.id,
        is_public: isPublic,
        description: description || null,
        max_teams: maxTeams ? Number(maxTeams) : null,
      } as any)
      .select()
      .single();

    if (error) {
      toast.error("Kunde inte skapa tävlingen: " + error.message);
    } else {
      const compData = data as any;
      if (!isPublic && compData?.invite_code) {
        setCreatedInviteCode(compData.invite_code);
        toast.success("Tävling skapad! Dela inbjudningskoden.");
      } else {
        toast.success("Tävling skapad!");
        await refresh();
        navigate("/");
      }
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
      })
      .select()
      .single();

    if (error) {
      toast.error("Kunde inte skapa laget: " + error.message);
    } else {
      await supabase.from("team_members").insert({
        team_id: data.id,
        profile_id: user.id,
      });
      toast.success("Lag skapat!");
      await refresh();
      setCurrentTeamId(data.id);
      setCurrentTeamName(teamName);
      setPath("team-created");
    }
    setLoading(false);
  };

  const handleJoinCompetition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const { data: comp, error: findError } = await supabase
      .from("competitions")
      .select("id, name, initial_balance")
      .eq("invite_code", competitionCode.trim())
      .single();

    if (findError || !comp) {
      toast.error("Ingen tävling hittades med den koden.");
      setLoading(false);
      return;
    }

    let teamId = currentTeamId;

    if (!teamId) {
      const { data: memberRows } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("profile_id", user.id);

      const teamIds = (memberRows || []).map((r) => r.team_id);

      if (teamIds.length === 0) {
        toast.error("Du behöver ha ett lag först.");
        setLoading(false);
        return;
      }
      teamId = teamIds[0];
    }

    const compData = comp as any;
    const { error } = await supabase.from("competition_teams").insert({
      competition_id: compData.id,
      team_id: teamId,
      cash_balance_sek: compData.initial_balance,
    });

    if (error) {
      if (error.message.includes("duplicate")) {
        toast.error("Ditt lag är redan med i denna tävling.");
      } else {
        toast.error("Kunde inte gå med: " + error.message);
      }
    } else {
      toast.success(`Gick med i ${compData.name}!`);
      await refresh();
      navigate("/");
    }
    setLoading(false);
  };

  const copyCode = () => {
    if (createdInviteCode) {
      navigator.clipboard.writeText(createdInviteCode);
      setCopied(true);
      toast.success("Kopierad!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="flex items-center justify-center p-4 pt-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold tracking-tight">StockArena</span>
          </div>
          <p className="text-muted-foreground text-sm">Välkommen! Kom igång på under en minut.</p>
        </div>

        <Progress value={progress} className="h-2" />

        {path === "choose" && (
          <div className="grid gap-4">
            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => setPath("enter-code")}
            >
              <CardHeader className="flex flex-row items-center gap-4 pb-2">
                <div className="rounded-lg bg-primary/10 p-3">
                  <Ticket className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Jag har en kod</CardTitle>
                  <CardDescription>Gå med i ett lag eller en tävling med en inbjudningskod</CardDescription>
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
                  <CardTitle className="text-lg">Skapa nytt lag</CardTitle>
                  <CardDescription>Bli lagkapten, bjud in vänner och tävla</CardDescription>
                </div>
              </CardHeader>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => navigate("/competitions")}
            >
              <CardHeader className="flex flex-row items-center gap-4 pb-2">
                <div className="rounded-lg bg-primary/10 p-3">
                  <Search className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Bläddra tävlingar</CardTitle>
                  <CardDescription>Hitta och gå med i offentliga tävlingar</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </div>
        )}

        {path === "enter-code" && (
          <Card>
            <CardHeader>
              <CardTitle>Ange din kod</CardTitle>
              <CardDescription>Koden kan vara för ett lag eller en tävling — vi hittar rätt automatiskt</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEnterCode} className="space-y-4">
                <div className="space-y-2">
                  <Label>Inbjudningskod</Label>
                  <Input
                    placeholder="abc12345"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    autoFocus
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

        {path === "competition" && !createdInviteCode && (
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
                    placeholder="Vår-tävlingen 2026"
                    value={compName}
                    onChange={(e) => setCompName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>Offentlig tävling</Label>
                    <p className="text-xs text-muted-foreground">Alla kan hitta och gå med</p>
                  </div>
                  <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                </div>

                {isPublic && (
                  <div className="space-y-2">
                    <Label>Beskrivning (visas för alla)</Label>
                    <Textarea
                      placeholder="Beskriv din tävling..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Max antal lag (valfritt)</Label>
                  <Input
                    type="number"
                    placeholder="Obegränsat"
                    value={maxTeams}
                    onChange={(e) => setMaxTeams(e.target.value)}
                  />
                </div>

                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setPath("team-created")}>
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

        {path === "competition" && createdInviteCode && (
          <Card>
            <CardHeader>
              <CardTitle>Tävling skapad!</CardTitle>
              <CardDescription>Dela denna kod med de som ska gå med</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <code className="flex-1 rounded-lg bg-muted px-3 py-2 sm:px-4 sm:py-3 font-mono text-sm sm:text-lg tracking-wider sm:tracking-widest text-center">
                  {createdInviteCode}
                </code>
                <Button variant="outline" size="icon" onClick={copyCode}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Button className="w-full" onClick={async () => { await refresh(); navigate("/"); }}>
                Gå till Dashboard <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        )}

        {path === "create-team" && (
          <Card>
            <CardHeader>
              <CardTitle>Skapa ett lag</CardTitle>
              <CardDescription>Välj ett unikt lagnamn — du kan bjuda in medlemmar efteråt</CardDescription>
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
                    autoFocus
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

        {path === "team-created" && (
          <Card>
            <CardHeader>
              <CardTitle>Lag klart!</CardTitle>
              <CardDescription>
                Du är nu med i <span className="font-semibold text-foreground">{currentTeamName}</span>. Nästa steg: gå med i eller skapa en tävling.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                onSubmit={handleJoinCompetition}
                className="space-y-3"
              >
                <div className="space-y-2">
                  <Label>Har du en tävlingskod?</Label>
                  <Input
                    placeholder="abc12345"
                    value={competitionCode}
                    onChange={(e) => setCompetitionCode(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Söker..." : "Gå med i tävling"} <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </form>

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">eller</span>
                </div>
              </div>

              <div className="grid gap-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setPath("competition")}
                >
                  <Trophy className="h-4 w-4 mr-1.5" />
                  Skapa en ny tävling
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate("/competitions")}
                >
                  <Search className="h-4 w-4 mr-1.5" />
                  Bläddra offentliga tävlingar
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => navigate(`/team/${currentTeamId}`)}
                >
                  Hantera lag
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      </div>
    </div>
  );
}
