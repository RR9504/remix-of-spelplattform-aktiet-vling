import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkles, X, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FeedbackResponse {
  id: string;
  message: string;
  response: string;
}

export function FeedbackResponseOverlay() {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedbackResponse[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchUnseen = async () => {
      const { data } = await supabase
        .from("feedback")
        .select("id, message, response")
        .eq("user_id", user.id)
        .not("response", "is", null)
        .is("seen_at", null);

      if (data && data.length > 0) {
        setItems(data as FeedbackResponse[]);
        // Small delay so the page loads first
        setTimeout(() => {
          setVisible(true);
          setAnimating(true);
        }, 800);
      }
    };

    fetchUnseen();
  }, [user?.id]);

  const handleDismiss = async () => {
    const current = items[currentIndex];

    // Mark as seen
    await supabase
      .from("feedback")
      .update({ seen_at: new Date().toISOString() })
      .eq("id", current.id);

    if (currentIndex < items.length - 1) {
      setAnimating(false);
      setTimeout(() => {
        setCurrentIndex((i) => i + 1);
        setAnimating(true);
      }, 300);
    } else {
      setAnimating(false);
      setTimeout(() => setVisible(false), 300);
    }
  };

  if (!visible || items.length === 0) return null;

  const current = items[currentIndex];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-500 ${
          animating ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleDismiss}
      />

      {/* Card */}
      <div
        className={`relative w-full max-w-md transform transition-all duration-500 ${
          animating ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-4"
        }`}
      >
        {/* Sparkle particles */}
        <div className="absolute -top-6 -left-6 animate-bounce" style={{ animationDelay: "0s" }}>
          <Sparkles className="h-5 w-5 text-yellow-400" />
        </div>
        <div className="absolute -top-4 right-8 animate-bounce" style={{ animationDelay: "0.3s" }}>
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="absolute top-12 -right-4 animate-bounce" style={{ animationDelay: "0.6s" }}>
          <Sparkles className="h-5 w-5 text-yellow-400" />
        </div>
        <div className="absolute -bottom-4 left-12 animate-bounce" style={{ animationDelay: "0.9s" }}>
          <Sparkles className="h-4 w-4 text-primary" />
        </div>

        <div className="rounded-2xl border border-primary/30 bg-card shadow-2xl shadow-primary/10 overflow-hidden">
          {/* Header gradient */}
          <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/20 p-2.5">
                  <PartyPopper className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Din feedback blev verklighet!</h2>
                  <p className="text-xs text-muted-foreground">
                    Tack vare dig har vi förbättrat StockArena
                  </p>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="rounded-full p-1 hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* Original feedback */}
            <div className="rounded-lg bg-muted/50 border px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Du föreslog:</p>
              <p className="text-sm italic">"{current.message}"</p>
            </div>

            {/* Response */}
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
              <p className="text-xs text-primary font-medium mb-1">Nytt i StockArena:</p>
              <p className="text-sm">{current.response}</p>
            </div>

            {/* Action */}
            <div className="flex items-center justify-between pt-1">
              {items.length > 1 && (
                <span className="text-xs text-muted-foreground">
                  {currentIndex + 1} av {items.length} nyheter
                </span>
              )}
              <Button onClick={handleDismiss} className="ml-auto">
                {currentIndex < items.length - 1 ? "Nästa" : "Häftigt!"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
