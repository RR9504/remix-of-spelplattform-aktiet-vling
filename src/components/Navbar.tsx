import { Link, useLocation } from "react-router-dom";
import { BarChart3, TrendingUp, Trophy, Sparkles, ArrowRightLeft, Globe, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useCompetition } from "@/contexts/CompetitionContext";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const navItems = [
  { path: "/", label: "Dashboard", icon: BarChart3 },
  { path: "/trade", label: "Handla", icon: ArrowRightLeft },
  { path: "/leaderboard", label: "Topplista", icon: Trophy },
  { path: "/competitions", label: "Tävlingar", icon: Globe },
  { path: "/highlights", label: "Highlights", icon: Sparkles },
];

export function Navbar() {
  const location = useLocation();
  const { signOut } = useAuth();
  const { activeTeam, activeCompetition, teams, competitions, setActiveTeamId, setActiveCompetitionId } = useCompetition();

  return (
    <header className="sticky top-0 z-50 glass">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight">
            StockArena
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          {competitions.length > 1 && (
            <Select
              value={activeCompetition?.id ?? ""}
              onValueChange={(v) => setActiveCompetitionId(v)}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Tävling" />
              </SelectTrigger>
              <SelectContent>
                {competitions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {teams.length > 1 && (
            <Select
              value={activeTeam?.id ?? ""}
              onValueChange={(v) => setActiveTeamId(v)}
            >
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue placeholder="Lag" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="text-right hidden sm:block">
            {activeTeam && (
              <>
                <p className="text-xs text-muted-foreground">Lag</p>
                <p className="text-sm font-semibold">{activeTeam.name}</p>
              </>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} title="Logga ut">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
