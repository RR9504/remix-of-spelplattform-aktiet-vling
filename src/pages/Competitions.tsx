import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Users, Calendar, Loader2, Plus, Copy, Check, Link, TicketCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompetition } from "@/contexts/CompetitionContext";
import { formatSEK } from "@/lib/mockData";
import { JoinCompetitionDialog } from "@/components/JoinCompetitionDialog";
import { toast } from "sonner";

interface Competition {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  initial_balance: number;
  max_teams: number | null;
  is_public: boolean;
  invite_code?: string;
  team_count?: number;
}

type Filter = "upcoming" | "active" | "ended" | "all";

export default function Competitions() {
  const { user } = useAuth();
  const { refresh } = useCompetition();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [joining, setJoining] = useState<Competition | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [compName, setCompName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [balance, setBalance] = useState("1000000");
  const [isPublic, setIsPublic] = useState(false);
  const [description, setDescription] = useState("");
  const [maxTeams, setMaxTeams] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [myCompetitions, setMyCompetitions] = useState<(Competition & { role: string })[]>([]);
  const [copiedCompCode, setCopiedCompCode] = useState<string | null>(null);

  // Join by code
  const [showJoinCode, setShowJoinCode] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joinCodeLoading, setJoinCodeLoading] = useState(false);
  const [joinCodeTarget, setJoinCodeTarget] = useState<{ id: string; name: string; start_date: string; end_date: string; initial_balance: number } | null>(null);
  const [joinCodeError, setJoinCodeError] = useState("");

  const extractCode = (input: string): string => {
    const trimmed = input.trim();
    // Try to extract code from a URL like /join/competition/ABC123
    const urlMatch = trimmed.match(/\/join\/competition\/([A-Za-z0-9]+)/);
    if (urlMatch) return urlMatch[1];
    // Otherwise treat the whole input as a code
    return trimmed;
  };

  const handleLookupCode = async () => {
    const code = extractCode(joinCodeInput);
    if (!code) {
      setJoinCodeError("Ange en kod eller länk");
      return;
    }
    setJoinCodeLoading(true);
    setJoinCodeError("");
    setJoinCodeTarget(null);

    const { data: comp } = await supabase
      .from("competitions")
      .select("id, name, start_date, end_date, initial_balance")
      .eq("invite_code", code)
      .single();

    if (!comp) {
      setJoinCodeError("Ingen tävling hittades med denna kod");
    } else {
      setJoinCodeTarget(comp as any);
    }
    setJoinCodeLoading(false);
  };

  useEffect(() => {
    fetchCompetitions();
    fetchMyCompetitions();
  }, []);

  const fetchCompetitions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("competitions")
      .select("id, name, description, start_date, end_date, initial_balance, max_teams, is_public")
      .eq("is_public", true)
      .order("start_date", { ascending: false });

    if (!error && data) {
      const comps = data as unknown as Competition[];
      const compIds = comps.map((c) => c.id);

      // Single query to count teams per competition instead of N+1
      if (compIds.length > 0) {
        const { data: ctRows } = await supabase
          .from("competition_teams")
          .select("competition_id")
          .in("competition_id", compIds);

        const countMap: Record<string, number> = {};
        for (const row of (ctRows || []) as any[]) {
          countMap[row.competition_id] = (countMap[row.competition_id] || 0) + 1;
        }
        for (const comp of comps) {
          comp.team_count = countMap[comp.id] ?? 0;
        }
      }

      setCompetitions(comps);
    }
    setLoading(false);
  };

  const fetchMyCompetitions = async () => {
    if (!user) return;
    // Get teams user is in
    const { data: memberships } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("profile_id", user.id);
    if (!memberships || memberships.length === 0) return;

    const teamIds = memberships.map((m) => m.team_id);
    // Get competitions these teams are in
    const { data: compTeams } = await supabase
      .from("competition_teams")
      .select("competition_id, team_id")
      .in("team_id", teamIds);
    if (!compTeams || compTeams.length === 0) return;

    const compIds = [...new Set(compTeams.map((ct) => ct.competition_id))];
    const { data: comps } = await supabase
      .from("competitions")
      .select("id, name, description, start_date, end_date, initial_balance, max_teams, is_public, invite_code, created_by")
      .in("id", compIds)
      .order("start_date", { ascending: false });

    if (comps) {
      setMyCompetitions(
        (comps as any[]).map((c) => ({
          ...c,
          role: c.created_by === user.id ? "skapare" : "deltagare",
        }))
      );
    }
  };

  const copyCompCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCompCode(code);
    toast.success("Kod kopierad!");
    setTimeout(() => setCopiedCompCode(null), 2000);
  };

  const copyCompLink = (code: string) => {
    const link = `${window.location.origin}/join/competition/${code}`;
    navigator.clipboard.writeText(link);
    setCopiedCompCode(code + "-link");
    toast.success("Länk kopierad!");
    setTimeout(() => setCopiedCompCode(null), 2000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreating(true);

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
        setCreatedCode(compData.invite_code);
        toast.success("Tävling skapad!");
      } else {
        toast.success("Tävling skapad!");
        resetForm();
        setShowCreate(false);
        await refresh();
        fetchCompetitions();
      }
    }
    setCreating(false);
  };

  const resetForm = () => {
    setCompName("");
    setStartDate("");
    setEndDate("");
    setBalance("1000000");
    setIsPublic(false);
    setDescription("");
    setMaxTeams("");
    setCreatedCode(null);
  };

  const copyCode = () => {
    if (createdCode) {
      navigator.clipboard.writeText(createdCode);
      setCopied(true);
      toast.success("Kopierad!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const today = new Date().toISOString().split("T")[0];

  const getStatus = (comp: Competition) => {
    if (today < comp.start_date) return "upcoming";
    if (today > comp.end_date) return "ended";
    return "active";
  };

  const myCompIds = new Set(myCompetitions.map((mc) => mc.id));

  const filtered = competitions.filter((c) => {
    if (myCompIds.has(c.id)) return false;
    if (filter !== "all" && getStatus(c) !== filter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 pb-20 md:pb-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Tävlingar</h1>
            <p className="text-muted-foreground text-sm">Hitta, skapa och gå med i tävlingar</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setJoinCodeInput(""); setJoinCodeTarget(null); setJoinCodeError(""); setShowJoinCode(true); }}>
              <TicketCheck className="h-4 w-4 mr-2" /> Ange kod
            </Button>
            <Button onClick={() => { resetForm(); setShowCreate(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Skapa tävling
            </Button>
          </div>
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
          <div className="flex flex-wrap gap-2">
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

        {myCompetitions.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Mina tävlingar</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {myCompetitions.map((comp) => {
                const status = getStatus(comp);
                return (
                  <Card key={comp.id} className="border-primary/20">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{comp.name}</CardTitle>
                        <div className="flex gap-1">
                          {!comp.is_public && (
                            <Badge variant="outline" className="text-[10px]">Privat</Badge>
                          )}
                          <Badge
                            variant={status === "active" ? "default" : "outline"}
                            className={
                              status === "active"
                                ? "bg-gain/20 text-gain border-gain/30 text-[10px]"
                                : "text-[10px]"
                            }
                          >
                            {status === "active" ? "Aktiv" : status === "upcoming" ? "Kommande" : "Avslutad"}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-xs text-muted-foreground">
                        {comp.start_date} – {comp.end_date} · {formatSEK(comp.initial_balance)}
                      </div>
                      {comp.invite_code && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Inbjudningskod:</p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 min-w-0 rounded bg-muted px-2 py-1.5 font-mono text-[11px] sm:text-sm tracking-wider sm:tracking-widest text-center truncate">
                              {comp.invite_code}
                            </code>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => copyCompCode(comp.invite_code!)}
                            >
                              {copiedCompCode === comp.invite_code ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => copyCompLink(comp.invite_code!)}
                              title="Kopiera inbjudningslänk"
                            >
                              {copiedCompCode === comp.invite_code + "-link" ? <Check className="h-3 w-3" /> : <Link className="h-3 w-3" />}
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <h2 className="text-lg font-semibold">Offentliga tävlingar</h2>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Inga offentliga tävlingar hittades.</p>
            <p className="text-sm mt-1">Skapa en ny eller gå med via tävlingskod i "Kom igång".</p>
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
                      myCompetitions.some((mc) => mc.id === comp.id) ? (
                        <Badge variant="outline" className="w-full justify-center py-2 text-xs text-muted-foreground">
                          Redan med
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => setJoining(comp)}
                          disabled={comp.max_teams !== null && (comp.team_count ?? 0) >= comp.max_teams}
                        >
                          Gå med
                        </Button>
                      )
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

      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) { resetForm(); setShowCreate(false); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{createdCode ? "Tävling skapad!" : "Skapa ny tävling"}</DialogTitle>
          </DialogHeader>

          {createdCode ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Din privata tävling är skapad. Dela koden med de som ska gå med:
              </p>
              <div className="flex items-center gap-3">
                <code className="flex-1 rounded-lg bg-muted px-4 py-3 font-mono text-lg tracking-widest text-center">
                  {createdCode}
                </code>
                <Button variant="outline" size="icon" onClick={copyCode}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Button
                className="w-full"
                onClick={async () => {
                  resetForm();
                  setShowCreate(false);
                  await refresh();
                  fetchCompetitions();
                }}
              >
                Klar
              </Button>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
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
                  <Label>Beskrivning</Label>
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
              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {creating ? "Skapar..." : "Skapa tävling"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showJoinCode} onOpenChange={(open) => { if (!open) setShowJoinCode(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gå med i tävling</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Klistra in inbjudningskoden eller hela länken du fått från tävlingsarrangören.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Kod eller länk..."
                value={joinCodeInput}
                onChange={(e) => { setJoinCodeInput(e.target.value); setJoinCodeError(""); setJoinCodeTarget(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleLookupCode()}
              />
              <Button onClick={handleLookupCode} disabled={joinCodeLoading || !joinCodeInput.trim()}>
                {joinCodeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sök"}
              </Button>
            </div>
            {joinCodeError && (
              <p className="text-sm text-destructive">{joinCodeError}</p>
            )}
            {joinCodeTarget && (
              <div className="rounded-lg border p-4 space-y-3">
                <div>
                  <p className="font-semibold">{joinCodeTarget.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {joinCodeTarget.start_date} – {joinCodeTarget.end_date} · {formatSEK(joinCodeTarget.initial_balance)}
                  </p>
                </div>
                {myCompetitions.some((mc) => mc.id === joinCodeTarget.id) ? (
                  <Badge variant="outline" className="text-xs text-muted-foreground">Du är redan med i denna tävling</Badge>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => {
                      setShowJoinCode(false);
                      setJoining({ ...joinCodeTarget, description: null, max_teams: null, is_public: false } as Competition);
                    }}
                  >
                    Gå med
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
