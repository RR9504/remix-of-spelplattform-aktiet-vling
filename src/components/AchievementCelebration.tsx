import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";

interface AchievementCelebrationProps {
  icon: string;
  name: string;
  description: string;
  onDismiss: () => void;
}

export function AchievementCelebration({
  icon,
  name,
  description,
  onDismiss,
}: AchievementCelebrationProps) {
  useEffect(() => {
    const colors = ["#2dd4bf", "#fbbf24", "#f472b6", "#60a5fa", "#a78bfa"];

    // Single burst from center
    confetti({
      particleCount: 80,
      spread: 90,
      origin: { x: 0.5, y: 0.45 },
      colors,
      startVelocity: 40,
      gravity: 1,
      ticks: 200,
      disableForReducedMotion: true,
    });

    // Side cannons after short delay
    const sideTimer = setTimeout(() => {
      confetti({
        particleCount: 30,
        angle: 60,
        spread: 50,
        origin: { x: 0, y: 0.6 },
        colors,
        ticks: 150,
        disableForReducedMotion: true,
      });
      confetti({
        particleCount: 30,
        angle: 120,
        spread: 50,
        origin: { x: 1, y: 0.6 },
        colors,
        ticks: 150,
        disableForReducedMotion: true,
      });
    }, 250);

    const dismissTimer = setTimeout(onDismiss, 4000);

    return () => {
      clearTimeout(sideTimer);
      clearTimeout(dismissTimer);
      confetti.reset();
    };
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 cursor-pointer"
        onClick={onDismiss}
      >
        <motion.div
          initial={{ scale: 0, rotate: -15 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: "spring",
            stiffness: 250,
            damping: 18,
            delay: 0.05,
          }}
          className="flex flex-col items-center gap-6 pointer-events-none select-none"
        >
          <div className="relative flex h-36 w-36 items-center justify-center rounded-full border-4 border-primary/40 bg-card shadow-2xl">
            <span className="text-7xl">{icon}</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.3 }}
            className="text-center"
          >
            <p className="text-sm font-medium uppercase tracking-widest text-primary mb-2">
              Achievement upplåst!
            </p>
            <p className="text-3xl font-bold text-white">{name}</p>
            <p className="mt-2 text-lg text-white/70">{description}</p>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ delay: 1.2 }}
            className="text-sm text-white/40 mt-2"
          >
            Tryck var som helst för att stänga
          </motion.p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
