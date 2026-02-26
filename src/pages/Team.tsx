import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompetition } from "@/contexts/CompetitionContext";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Users, Crown, Link, Search, UserPlus, Loader2, X, LogOut } from "lucide-react";
import { AchievementShowcase } from "@/components/AchievementShowcase";
import { toast } from "sonner";

interface TeamData {
  id: string;
  name: string;
  captain_id: string;
  invite_code: string;
}

interface MemberData {
  profile_id: string;
  profiles: { email: string; full_name: string | null };
}

interface ProfileResult {
  id: string;
  email: string;
  full_name: string | null;
}

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { refresh } = useCompetition();
  const navigate = useNavigate();
  const [team, setTeam] = useState<TeamData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Add member search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchMembers = async () => {
    if (!id) return;
    const { data } = await supabase
      .from("team_members")
      .select("profile_id, profiles(email, full_name)")
      .eq("team_id", id);
    setMembers((data as unknown as MemberData[]) || []);
  };

  useEffect(() => {
    if (!id) return;

    const fetchTeam = async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, name, captain_id, invite_code")
        .eq("id", id)
        .single();
      setTeam(data as TeamData | null);
    };

    fetchTeam();
    fetchMembers().then(() => setLoading(false));
  }, [id]);

  // Debounced user search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const memberIds = members.map((m) => m.profile_id);

      const { data } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .or(`email.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`)
        .limit(10);

      // Filter out existing members
      const filtered = (data as unknown as ProfileResult[] || []).filter(
        (p) => !memberIds.includes(p.id)
      );
      setSearchResults(filtered);
      setSearching(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, members]);

  const handleAddMember = async (profile: ProfileResult) => {
    if (!id) return;
    setAdding(profile.id);

    const { error } = await supabase.from("team_members").insert({
      team_id: id,
      profile_id: profile.id,
    });

    if (error) {
      if (error.message.includes("duplicate")) {
        toast.error("Användaren är redan med i laget.");
      } else {
        toast.error("Kunde inte lägga till: " + error.message);
      }
    } else {
      toast.success(`${profile.full_name || profile.email} tillagd i laget!`);
      await fetchMembers();
      setSearchQuery("");
      setSearchResults([]);
    }
    setAdding(null);
  };

  const handleRemoveMember = async (profileId: string) => {
    if (!id) return;
    setRemoving(profileId);

    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", id)
      .eq("profile_id", profileId);

    if (error) {
      toast.error("Kunde inte ta bort medlemmen: " + error.message);
    } else {
      const member = members.find((m) => m.profile_id === profileId);
      toast.success(`${member?.profiles?.full_name || "Medlemmen"} borttagen från laget.`);
      await fetchMembers();
    }
    setRemoving(null);
    setConfirmRemove(null);
  };

  const handleLeaveTeam = async () => {
    if (!id || !user) return;
    setLeaving(true);

    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", id)
      .eq("profile_id", user.id);

    if (error) {
      toast.error("Kunde inte lämna laget: " + error.message);
      setLeaving(false);
    } else {
      toast.success("Du har lämnat laget.");
      await refresh();
      navigate("/");
    }
  };

  const copyCode = () => {
    if (team?.invite_code) {
      navigator.clipboard.writeText(team.invite_code);
      setCopied(true);
      toast.success("Kopierad!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyLink = () => {
    if (team?.invite_code) {
      const link = `${window.location.origin}/join/team/${team.invite_code}`;
      navigator.clipboard.writeText(link);
      setCopiedLink(true);
      toast.success("Länk kopierad!");
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const isCaptain = user?.id === team?.captain_id;
  const isMember = members.some((m) => m.profile_id === user?.id);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container py-6 pb-20 md:pb-6">
          <p className="text-muted-foreground">Laddar...</p>
        </main>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container py-6 pb-20 md:pb-6">
          <p className="text-muted-foreground">Lag hittades inte.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 pb-20 md:pb-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              {team.name}
            </h1>
            <p className="text-muted-foreground text-sm">
              {members.length} {members.length === 1 ? "medlem" : "medlemmar"}
            </p>
          </div>
          {/* Leave team button for non-captains */}
          {isMember && !isCaptain && (
            <div>
              {confirmLeave ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Lämna laget?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleLeaveTeam}
                    disabled={leaving}
                  >
                    {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ja, lämna"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmLeave(false)}
                  >
                    Avbryt
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmLeave(true)}
                >
                  <LogOut className="h-4 w-4 mr-1.5" />
                  Lämna lag
                </Button>
              )}
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Inbjudningskod</CardTitle>
            <CardDescription>Dela denna kod eller länk med dina vänner så de kan gå med i laget</CardDescription>
          </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <code className="flex-1 rounded-lg bg-muted px-4 py-3 font-mono text-lg tracking-widest">
                  {team.invite_code}
                </code>
                <Button variant="outline" size="icon" onClick={copyCode}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="icon" onClick={copyLink} title="Kopiera inbjudningslänk">
                  {copiedLink ? <Check className="h-4 w-4" /> : <Link className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Medlemmar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {members.map((m) => {
                const isMemberCaptain = m.profile_id === team.captain_id;
                const isMe = m.profile_id === user?.id;
                const showRemove = isCaptain && !isMemberCaptain;

                return (
                  <div
                    key={m.profile_id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {m.profiles?.full_name || "Okänd"}
                        {isMe && <span className="text-xs text-muted-foreground ml-1">(du)</span>}
                        {isMemberCaptain && (
                          <Crown className="inline ml-2 h-4 w-4 text-primary" />
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">{m.profiles?.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isMemberCaptain && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                          Kapten
                        </span>
                      )}
                      {showRemove && (
                        confirmRemove === m.profile_id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleRemoveMember(m.profile_id)}
                              disabled={removing === m.profile_id}
                            >
                              {removing === m.profile_id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                "Ta bort"
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setConfirmRemove(null)}
                            >
                              Avbryt
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setConfirmRemove(m.profile_id)}
                            title="Ta bort från laget"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
              {members.length === 0 && (
                <p className="text-muted-foreground text-sm">Inga medlemmar ännu.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Add member - visible to captain */}
        {isCaptain && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Lägg till medlem
              </CardTitle>
              <CardDescription>Sök efter registrerade användare och lägg till dem i laget</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Sök på namn eller e-post..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>

                {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Inga användare hittades
                  </p>
                )}

                {searchResults.map((profile) => (
                  <div
                    key={profile.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium text-sm">{profile.full_name || "Okänd"}</p>
                      <p className="text-xs text-muted-foreground">{profile.email}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAddMember(profile)}
                      disabled={adding === profile.id}
                    >
                      {adding === profile.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4 mr-1.5" />
                          Lägg till
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Achievements per member */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Achievements</CardTitle>
            <CardDescription>Upplåsta achievements för lagmedlemmar</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {members.map((m) => (
                <div key={m.profile_id}>
                  <p className="text-sm font-medium mb-2">{m.profiles?.full_name || "Okänd"}</p>
                  <AchievementShowcase profileId={m.profile_id} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
