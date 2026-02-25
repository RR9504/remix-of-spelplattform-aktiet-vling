import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Mail, Lock, User } from "lucide-react";
import { toast } from "sonner";

type AuthMode = "login" | "signup" | "reset" | "update-password";

export default function Auth() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>(() => {
    const m = searchParams.get("mode");
    if (m === "update-password") return "update-password";
    return "login";
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Listen for PASSWORD_RECOVERY event
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("update-password");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message);
      } else {
        navigate("/");
      }
    } else if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Konto skapat! Kolla din e-post för att verifiera kontot.");
      }
    } else if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/auth?mode=update-password",
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Återställningslänk skickad! Kolla din e-post.");
        setMode("login");
      }
    } else if (mode === "update-password") {
      if (password !== confirmPassword) {
        toast.error("Lösenorden matchar inte.");
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Lösenordet har uppdaterats!");
        navigate("/");
      }
    }

    setLoading(false);
  };

  const title = {
    login: "Logga in",
    signup: "Skapa konto",
    reset: "Återställ lösenord",
    "update-password": "Nytt lösenord",
  }[mode];

  const description = {
    login: "Logga in på ditt konto för att fortsätta",
    signup: "Skapa ett nytt konto för att komma igång",
    reset: "Ange din e-postadress så skickar vi en återställningslänk",
    "update-password": "Välj ett nytt lösenord för ditt konto",
  }[mode];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold tracking-tight">StockArena</span>
          </div>
          <p className="text-muted-foreground text-sm">Din aktiesimulator</p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Fullständigt namn</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="fullName"
                      placeholder="Anna Andersson"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              )}

              {(mode === "login" || mode === "signup" || mode === "reset") && (
                <div className="space-y-2">
                  <Label htmlFor="email">E-postadress</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="din@email.se"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
              )}

              {(mode === "login" || mode === "signup") && (
                <div className="space-y-2">
                  <Label htmlFor="password">Lösenord</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10"
                      minLength={6}
                      required
                    />
                  </div>
                </div>
              )}

              {mode === "update-password" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="password">Nytt lösenord</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10"
                        minLength={6}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Bekräfta lösenord</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10"
                        minLength={6}
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? "Laddar..."
                  : mode === "login"
                  ? "Logga in"
                  : mode === "signup"
                  ? "Skapa konto"
                  : mode === "reset"
                  ? "Skicka återställningslänk"
                  : "Uppdatera lösenord"}
              </Button>
            </form>

            <div className="mt-4 text-center space-y-2">
              {mode === "login" && (
                <>
                  <button
                    type="button"
                    onClick={() => setMode("reset")}
                    className="text-sm text-muted-foreground hover:text-primary hover:underline block w-full"
                  >
                    Glömt lösenord?
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className="text-sm text-primary hover:underline"
                  >
                    Har du inget konto? Skapa ett här
                  </button>
                </>
              )}
              {mode === "signup" && (
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-sm text-primary hover:underline"
                >
                  Har du redan ett konto? Logga in
                </button>
              )}
              {mode === "reset" && (
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-sm text-primary hover:underline"
                >
                  Tillbaka till inloggning
                </button>
              )}
              {mode === "update-password" && (
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-sm text-primary hover:underline"
                >
                  Tillbaka till inloggning
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
