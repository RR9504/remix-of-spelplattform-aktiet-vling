import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Users, Trophy, ArrowRightLeft, BarChart3 } from "lucide-react";

const STEPS = [
  {
    icon: Sparkles,
    title: "Välkommen till StockArena!",
    text: "Tävla mot dina vänner i aktiehandel med fiktiva pengar. Köp och sälj riktiga aktier och se vem som gör bäst ifrån sig!",
  },
  {
    icon: Users,
    title: "Skapa eller gå med i ett lag",
    text: "Börja med att skapa ett lag eller gå med i ett befintligt. Ni kan vara flera som handlar tillsammans och delar på portföljen.",
  },
  {
    icon: Trophy,
    title: "Gå med i en tävling",
    text: "Använd en inbjudningslänk eller kod för att gå med i en tävling. Alla lag startar med samma kapital och tävlar under en bestämd period.",
  },
  {
    icon: ArrowRightLeft,
    title: "Börja handla",
    text: "Sök efter aktier på Stockholmsbörsen eller NYSE, köp och sälj i realtid. Du kan även lägga limitordrar och blanka aktier!",
  },
  {
    icon: BarChart3,
    title: "Följ din utveckling",
    text: "Håll koll på din portföljs värdeutveckling, se topplistan och jämför dig med andra lag. Lycka till!",
  },
];

interface WelcomeDialogProps {
  open: boolean;
  onClose: () => void;
}

export function WelcomeDialog({ open, onClose }: WelcomeDialogProps) {
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  const handleClose = () => {
    localStorage.setItem("stockarena_tutorial_seen", "true");
    setStep(0);
    onClose();
  };

  const handleNext = () => {
    if (isLast) {
      handleClose();
    } else {
      setStep(step + 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center items-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <current.icon className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription className="text-center">
            {current.text}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-1.5 py-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-6 rounded-full transition-colors ${
                i === step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          {!isFirst ? (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Föregående
            </Button>
          ) : (
            <Button variant="ghost" onClick={handleClose} className="text-muted-foreground">
              Hoppa över
            </Button>
          )}
          <Button onClick={handleNext}>
            {isLast ? "Klar" : "Nästa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
