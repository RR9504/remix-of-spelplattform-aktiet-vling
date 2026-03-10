import { Link } from "react-router-dom";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NoCompetitionState() {
  return (
    <div className="rounded-xl border bg-card p-8 text-center space-y-3">
      <Trophy className="h-8 w-8 text-muted-foreground mx-auto" />
      <p className="text-muted-foreground text-sm">
        Du behöver vara med i en aktiv tävling för att se denna sida.
      </p>
      <div className="flex justify-center gap-3">
        <Link to="/onboarding">
          <Button variant="outline" size="sm">Kom igång</Button>
        </Link>
        <Link to="/competitions">
          <Button variant="outline" size="sm">Hitta tävlingar</Button>
        </Link>
      </div>
    </div>
  );
}
