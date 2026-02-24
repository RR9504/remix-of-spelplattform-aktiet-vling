import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Users, Crown, Link } from "lucide-react";
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

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [team, setTeam] = useState<TeamData | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [loading, setLoading] = useState(true);

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

    const fetchMembers = async () => {
      const { data } = await supabase
        .from("team_members")
        .select("profile_id, profiles(email, full_name)")
        .eq("team_id", id);
      setMembers((data as unknown as MemberData[]) || []);
      setLoading(false);
    };

    fetchTeam();
    fetchMembers();
  }, [id]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container py-6">
          <p className="text-muted-foreground">Laddar...</p>
        </main>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container py-6">
          <p className="text-muted-foreground">Lag hittades inte.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 space-y-6">
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
              {members.map((m) => (
                <div
                  key={m.profile_id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {m.profiles?.full_name || "Okänd"}
                      {m.profile_id === team.captain_id && (
                        <Crown className="inline ml-2 h-4 w-4 text-primary" />
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">{m.profiles?.email}</p>
                  </div>
                  {m.profile_id === team.captain_id && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                      Kapten
                    </span>
                  )}
                </div>
              ))}
              {members.length === 0 && (
                <p className="text-muted-foreground text-sm">Inga medlemmar ännu.</p>
              )}
            </div>
          </CardContent>
        </Card>
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
