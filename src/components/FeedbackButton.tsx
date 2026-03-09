import { useState } from "react";
import { MessageSquarePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function FeedbackButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  if (!user) return null;

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;

    setSending(true);
    const { error } = await supabase.from("feedback" as any).insert({
      user_id: user.id,
      message: trimmed,
      page_url: window.location.pathname,
    } as any);

    if (error) {
      toast.error("Kunde inte skicka feedback");
    } else {
      toast.success("Tack för din feedback!");
      setMessage("");
      setOpen(false);
    }
    setSending(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-50 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors flex items-center justify-center"
        title="Skicka feedback"
      >
        <MessageSquarePlus className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Skicka feedback</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Berätta vad du tycker, rapportera buggar eller föreslå förbättringar.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Skriv din feedback här..."
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Avbryt
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!message.trim() || sending}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Skicka
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
