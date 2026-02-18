import { Navbar } from "@/components/Navbar";
import { LeaderboardTable } from "@/components/LeaderboardTable";

const Leaderboard = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Topplista</h1>
          <p className="text-muted-foreground text-sm">Alla lags avkastning rangordnade</p>
        </div>
        <LeaderboardTable />
      </main>
    </div>
  );
};

export default Leaderboard;
