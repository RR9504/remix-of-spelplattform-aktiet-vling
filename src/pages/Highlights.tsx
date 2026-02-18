import { Navbar } from "@/components/Navbar";
import { WeeklyHighlights } from "@/components/WeeklyHighlights";

const Highlights = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Highlights</h1>
          <p className="text-muted-foreground text-sm">Veckans utmärkelser och Wall of Fame</p>
        </div>
        <WeeklyHighlights />
      </main>
    </div>
  );
};

export default Highlights;
