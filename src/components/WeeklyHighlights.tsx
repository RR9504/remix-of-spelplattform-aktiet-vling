import { useEffect } from "react";
import { Rocket, Crown } from "lucide-react";
import { weeklyRocket, weeklyWinner } from "@/lib/mockData";
import confetti from "canvas-confetti";
import { motion } from "framer-motion";

export function WeeklyHighlights() {
  useEffect(() => {
    const timer = setTimeout(() => {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#2dd4bf', '#fbbf24', '#f472b6'],
      });
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-xl border bg-card p-8"
      >
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Rocket className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Veckans Raket 🚀</p>
            <p className="text-xl font-bold">Den aktie som ökat mest</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-bold">{weeklyRocket.ticker}</span>
            <span className="text-muted-foreground">{weeklyRocket.name}</span>
          </div>
          <p className="text-3xl font-bold font-mono text-gain">+{weeklyRocket.changePercent}%</p>
          <p className="text-sm text-muted-foreground">
            I <span className="font-semibold text-foreground">{weeklyRocket.team}</span>s portfölj
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="relative overflow-hidden rounded-xl border bg-card p-8"
      >
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-yellow-400/10 blur-2xl" />
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-400/10">
            <Crown className="h-6 w-6 text-yellow-400" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Veckans Vinnare 🏆</p>
            <p className="text-xl font-bold">Bästa laget denna vecka</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <p className="text-2xl font-bold">{weeklyWinner.team}</p>
          <p className="text-3xl font-bold font-mono text-gain">+{weeklyWinner.changePercent}%</p>
          <p className="text-sm text-muted-foreground">Totalavkastning denna vecka</p>
        </div>
      </motion.div>
    </div>
  );
}
