import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CompetitionProvider } from "@/contexts/CompetitionContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import Index from "./pages/Index";
import Trade from "./pages/Trade";
import Leaderboard from "./pages/Leaderboard";
import Highlights from "./pages/Highlights";
import History from "./pages/History";
import Auth from "./pages/Auth";
import Onboarding from "./pages/Onboarding";
import Team from "./pages/Team";
import Competitions from "./pages/Competitions";
import StockDetail from "./pages/StockDetail";
import TeamProfile from "./pages/TeamProfile";
import JoinLanding from "./pages/JoinLanding";
import Watchlist from "./pages/Watchlist";
import Analytics from "./pages/Analytics";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Laddar...</p></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Laddar...</p></div>;
  if (user) {
    // Check for join redirect
    const redirect = sessionStorage.getItem("joinRedirect");
    if (redirect) {
      sessionStorage.removeItem("joinRedirect");
      return <Navigate to={redirect} replace />;
    }
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CompetitionProvider>
            <NotificationProvider>
              <Routes>
                <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
                <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
                <Route path="/team/:id" element={<ProtectedRoute><Team /></ProtectedRoute>} />
                <Route path="/team/:id/profile" element={<ProtectedRoute><TeamProfile /></ProtectedRoute>} />
                <Route path="/competitions" element={<ProtectedRoute><Competitions /></ProtectedRoute>} />
                <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/trade" element={<ProtectedRoute><Trade /></ProtectedRoute>} />
                <Route path="/leaderboard" element={<ProtectedRoute><Leaderboard /></ProtectedRoute>} />
                <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
                <Route path="/highlights" element={<ProtectedRoute><Highlights /></ProtectedRoute>} />
                <Route path="/watchlist" element={<ProtectedRoute><Watchlist /></ProtectedRoute>} />
                <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/stock/:ticker" element={<ProtectedRoute><StockDetail /></ProtectedRoute>} />
                <Route path="/join/:type/:code" element={<JoinLanding />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </NotificationProvider>
          </CompetitionProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
