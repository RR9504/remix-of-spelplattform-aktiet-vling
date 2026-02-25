import { Link, useLocation } from "react-router-dom";
import { BarChart3, TrendingUp, Trophy, Sparkles, ArrowRightLeft, Globe, History, Bell, Eye, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useCompetition } from "@/contexts/CompetitionContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationPanel } from "@/components/NotificationPanel";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { path: "/", label: "Dashboard", icon: BarChart3 },
  { path: "/trade", label: "Handla", icon: ArrowRightLeft },
  { path: "/leaderboard", label: "Topplista", icon: Trophy },
  { path: "/competitions", label: "Tävlingar", icon: Globe },
  { path: "/watchlist", label: "Bevakning", icon: Eye },
  { path: "/history", label: "Historik", icon: History },
  { path: "/highlights", label: "Highlights", icon: Sparkles },
];

export function Navbar() {
  const location = useLocation();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (!user) return;

    // Try user_metadata first (available immediately)
    const metaName = user.user_metadata?.full_name;
    if (metaName) {
      setDisplayName(metaName);
    }

    // Fetch from profiles for the most up-to-date name
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.full_name) {
          setDisplayName(data.full_name);
        } else if (data?.email) {
          setDisplayName(data.email.split("@")[0]);
        }
      });
  }, [user]);

  const initials = displayName
    ? displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

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
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground font-bold">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-auto" align="end">
              <NotificationPanel />
            </PopoverContent>
          </Popover>
          <Link
            to="/profile"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors"
            title="Min profil"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">
              {initials}
            </div>
            <span className="text-sm font-medium hidden sm:inline">{displayName}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
