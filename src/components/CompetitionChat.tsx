import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompetition } from "@/contexts/CompetitionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MessageCircle, Send, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";

interface ChatMessage {
  id: string;
  competition_id: string;
  profile_id: string;
  body: string;
  created_at: string;
  sender_name?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function CompetitionChat() {
  const { user } = useAuth();
  const { activeCompetition } = useCompetition();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const [lastSent, setLastSent] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const profileCache = useRef<Record<string, string>>({});

  const fetchMessages = useCallback(async () => {
    if (!activeCompetition) return;
    const { data } = await supabase
      .from("competition_messages")
      .select("*")
      .eq("competition_id", activeCompetition.id)
      .order("created_at", { ascending: true })
      .limit(100);

    if (data) {
      const enriched = await enrichMessages(data as ChatMessage[]);
      setMessages(enriched);
    }
  }, [activeCompetition?.id]);

  const enrichMessages = async (msgs: ChatMessage[]) => {
    const profileIds = [...new Set(msgs.map((m) => m.profile_id))];
    const missing = profileIds.filter((id) => !profileCache.current[id]);

    if (missing.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", missing);

      for (const p of profiles || []) {
        profileCache.current[p.id] = p.full_name || p.email || "Okänd";
      }
    }

    return msgs.map((m) => ({
      ...m,
      sender_name: profileCache.current[m.profile_id] || "Okänd",
    }));
  };

  useEffect(() => {
    if (!activeCompetition) return;
    fetchMessages();

    const channel = supabase
      .channel(`chat-${activeCompetition.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "competition_messages",
          filter: `competition_id=eq.${activeCompetition.id}`,
        },
        async (payload) => {
          const newMsg = payload.new as ChatMessage;
          const enriched = await enrichMessages([newMsg]);
          setMessages((prev) => [...prev, enriched[0]]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCompetition?.id]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!body.trim() || !activeCompetition || !user) return;

    // Rate limit: 1 msg / 2 sec
    const now = Date.now();
    if (now - lastSent < 2000) return;

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          competition_id: activeCompetition.id,
          body: body.trim(),
        }),
      });
      const result = await res.json();
      if (result.success) {
        setBody("");
        setLastSent(Date.now());
      }
    } catch {
      // silently fail
    }
    setSending(false);
  };

  if (!activeCompetition) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border bg-card">
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full p-4 hover:bg-muted rounded-t-xl transition-colors">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              <span className="font-semibold">Tävlingschatt</span>
              <span className="text-xs text-muted-foreground">
                ({messages.length} meddelanden)
              </span>
            </div>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t">
            <ScrollArea className="h-64 p-4" ref={scrollRef}>
              <div className="space-y-3">
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Inga meddelanden ännu. Skriv det första!
                  </p>
                )}
                {messages.map((msg) => {
                  const isOwn = msg.profile_id === user?.id;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 ${
                          isOwn ? "bg-primary text-primary-foreground" : "bg-muted"
                        }`}
                      >
                        {!isOwn && (
                          <p className="text-xs font-semibold mb-0.5">{msg.sender_name}</p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: sv })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="flex items-center gap-2 p-3 border-t">
              <Input
                placeholder="Skriv ett meddelande..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                maxLength={500}
                className="flex-1"
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!body.trim() || sending}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
