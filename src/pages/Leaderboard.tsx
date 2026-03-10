import { Navbar } from "@/components/Navbar";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { SeasonRanking } from "@/components/SeasonRanking";
import { NoCompetitionState } from "@/components/NoCompetitionState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompetition } from "@/contexts/CompetitionContext";

const Leaderboard = () => {
  const { activeCompetition } = useCompetition();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 pb-28 md:pb-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Topplista</h1>
          <p className="text-muted-foreground text-sm">Alla lags avkastning rangordnade</p>
        </div>
        {!activeCompetition ? (
          <NoCompetitionState />
        ) : (
          <Tabs defaultValue="competition">
            <TabsList>
              <TabsTrigger value="competition">Tävling</TabsTrigger>
              <TabsTrigger value="season">Säsong</TabsTrigger>
            </TabsList>
            <TabsContent value="competition">
              <LeaderboardTable />
            </TabsContent>
            <TabsContent value="season">
              <SeasonRanking />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default Leaderboard;
