import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { getAchievements } from "@/lib/api";
import { AchievementCelebration } from "@/components/AchievementCelebration";
import type { Achievement, UserAchievement } from "@/types/trading";

interface AchievementShowcaseProps {
  profileId?: string;
}

export function AchievementShowcase({ profileId }: AchievementShowcaseProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [unlocked, setUnlocked] = useState<UserAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [celebration, setCelebration] = useState<Achievement | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const data = await getAchievements(profileId);
      setAchievements(data.achievements);
      setUnlocked(data.unlocked);
      setLoading(false);
    };
    fetch();
  }, [profileId]);

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const unlockedKeys = new Set(unlocked.map((u) => u.achievement?.key || u.achievement_id));

  return (
    <div className="rounded-xl border bg-card p-6">
      <h2 className="text-lg font-semibold mb-4">Achievements</h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {achievements.map((a) => {
          const isUnlocked = unlocked.some((u) => u.achievement_id === a.id);
          return (
            <div
              key={a.id}
              className={`flex flex-col items-center text-center rounded-lg p-3 transition-all ${
                isUnlocked
                  ? "bg-primary/10 border border-primary/30 cursor-pointer hover:bg-primary/20"
                  : "bg-muted/50 opacity-50"
              }`}
              title={isUnlocked ? `${a.name}: ${a.description}` : "Låst"}
              onClick={() => isUnlocked && setCelebration(a)}
            >
              <span className="text-2xl mb-1">
                {isUnlocked ? a.icon : "❓"}
              </span>
              <span className={`text-xs font-medium ${isUnlocked ? "" : "text-muted-foreground"}`}>
                {isUnlocked ? a.name : "???"}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-3 text-center">
        {unlocked.length} / {achievements.length} upplåsta
      </p>
      {celebration && (
        <AchievementCelebration
          icon={celebration.icon}
          name={celebration.name}
          description={celebration.description}
          onDismiss={() => setCelebration(null)}
        />
      )}
    </div>
  );
}
