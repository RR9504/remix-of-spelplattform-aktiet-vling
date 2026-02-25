import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";

interface AchievementCelebrationProps {
  icon: string;
  name: string;
  description: string;
  onDismiss: () => void;
}

function fireConfetti() {
  const duration = 2500;
  const end = Date.now() + duration;

  const colors = ["#2dd4bf", "#fbbf24", "#f472b6", "#60a5fa", "#a78bfa"];

  // Initial big burst from center
  confetti({
    particleCount: 100,
    spread: 100,
    origin: { x: 0.5, y: 0.4 },
    colors,
    startVelocity: 45,
    gravity: 0.8,
    ticks: 300,
  });

  // Side cannons
  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      colors,
    });
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 },
      colors,
    });
  }, 300);

  // Continuous rain
  const interval = setInterval(() => {
    if (Date.now() > end) {
      clearInterval(interval);
      return;
    }
    confetti({
      particleCount: 15,
      spread: 120,
      origin: { x: Math.random(), y: -0.1 },
      colors,
      startVelocity: 25,
      gravity: 1.2,
      ticks: 200,
    });
  }, 200);
}

export function AchievementCelebration({
  icon,
  name,
  description,
  onDismiss,
}: AchievementCelebrationProps) {
  useEffect(() => {
    fireConfetti();
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
        onClick={onDismiss}
      >
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 15,
            delay: 0.1,
          }}
          className="flex flex-col items-center gap-6 pointer-events-none select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Glow ring */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="relative"
          >
            <div className="absolute inset-0 rounded-full bg-primary/30 blur-3xl scale-150" />
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              className="relative flex h-40 w-40 items-center justify-center rounded-full border-4 border-primary/40 bg-card shadow-2xl shadow-primary/20"
            >
              <span className="text-8xl">{icon}</span>
            </motion.div>
          </motion.div>

          {/* Label */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
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
            transition={{ delay: 1.5 }}
            className="text-sm text-white/40 mt-4"
          >
            Tryck var som helst för att stänga
          </motion.p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
