import { Link, useLocation } from "react-router-dom";
import { BarChart3, TrendingUp, Trophy, Sparkles, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/", label: "Dashboard", icon: BarChart3 },
  { path: "/trade", label: "Handla", icon: ArrowRightLeft },
  { path: "/leaderboard", label: "Topplista", icon: Trophy },
  { path: "/highlights", label: "Highlights", icon: Sparkles },
];

export function Navbar() {
  const location = useLocation();

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
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Lag</p>
            <p className="text-sm font-semibold">Börshajarna</p>
          </div>
        </div>
      </div>
    </header>
  );
}
