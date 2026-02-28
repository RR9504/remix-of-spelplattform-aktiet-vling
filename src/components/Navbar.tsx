import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  TrendingUp,
  Trophy,
  Sparkles,
  ArrowRightLeft,
  Globe,
  History,
  Bell,
  Eye,
  Menu,
  User,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationPanel } from "@/components/NotificationPanel";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer } from "vaul";

const navItems = [
  { path: "/", label: "Dashboard", icon: BarChart3 },
  { path: "/trade", label: "Handla", icon: ArrowRightLeft },
  { path: "/leaderboard", label: "Topplista", icon: Trophy },
  { path: "/competitions", label: "Tävlingar", icon: Globe },
  { path: "/watchlist", label: "Bevakning", icon: Eye },
  { path: "/history", label: "Historik", icon: History },
  { path: "/highlights", label: "Highlights", icon: Sparkles },
];

// Bottom tab bar items (mobile)
const bottomTabs = [
  { path: "/", label: "Hem", icon: BarChart3 },
  { path: "/trade", label: "Handla", icon: ArrowRightLeft },
  { path: "/leaderboard", label: "Topplista", icon: Trophy },
  { path: "/watchlist", label: "Bevakning", icon: Eye },
];

// Items in the "Mer" drawer
const moreItems = [
  { path: "/competitions", label: "Tävlingar", icon: Globe },
  { path: "/history", label: "Historik", icon: History },
  { path: "/highlights", label: "Highlights", icon: Sparkles },
  { path: "/team", label: "Lag", icon: Users },
  { path: "/profile", label: "Profil", icon: User },
];

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const [displayName, setDisplayName] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const metaName = user.user_metadata?.full_name;
    if (metaName) {
      setDisplayName(metaName);
    }

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

  const isMoreActive = moreItems.some((item) => location.pathname === item.path);

  return (
    <>
      {/* ── Desktop header (md+) ── */}
      <header className="sticky top-0 z-50 glass hidden md:block pt-[env(safe-area-inset-top)]">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold tracking-tight">StockArena</span>
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
                  <span>{item.label}</span>
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
              <span className="text-sm font-medium">{displayName}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Mobile header (<md) ── */}
      <header className="sticky top-0 z-50 glass flex md:hidden pt-[env(safe-area-inset-top)]">
        <div className="container flex h-14 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <span className="text-base font-bold tracking-tight">StockArena</span>
          </Link>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-9 w-9">
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
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold"
              title="Min profil"
            >
              {initials}
            </Link>
          </div>
        </div>
      </header>

      {/* ── Mobile bottom tab bar (<md) ── */}
      <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16">
          {bottomTabs.map((tab) => {
            const isActive = location.pathname === tab.path;
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 flex-1 h-full text-[11px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <tab.icon className="h-5 w-5" />
                <span>{tab.label}</span>
              </Link>
            );
          })}

          {/* "Mer" button */}
          <Drawer.Root open={moreOpen} onOpenChange={setMoreOpen}>
            <Drawer.Trigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center justify-center gap-1 flex-1 h-full text-[11px] font-medium transition-colors",
                  isMoreActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Menu className="h-5 w-5" />
                <span>Mer</span>
              </button>
            </Drawer.Trigger>
            <Drawer.Portal>
              <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
              <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 rounded-t-2xl bg-background border-t">
                <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
                <Drawer.Title className="sr-only">Fler sidor</Drawer.Title>
                <div className="p-4 pb-8 space-y-1">
                  {moreItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                      <button
                        key={item.path}
                        onClick={() => {
                          setMoreOpen(false);
                          navigate(item.path);
                        }}
                        className={cn(
                          "flex items-center gap-3 w-full rounded-lg px-4 py-3 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-muted"
                        )}
                      >
                        <item.icon className="h-5 w-5" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>
        </div>
      </nav>
    </>
  );
}
