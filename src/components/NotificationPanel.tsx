import { useNotifications } from "@/contexts/NotificationContext";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, TrendingUp, AlertTriangle, Trophy, Bell, Users, ShoppingCart } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";
import type { NotificationType } from "@/types/trading";

const TYPE_ICONS: Record<NotificationType, typeof Bell> = {
  trade_executed: ShoppingCart,
  order_filled: Check,
  order_expired: AlertTriangle,
  margin_call: AlertTriangle,
  forced_cover: AlertTriangle,
  achievement_unlocked: Trophy,
  competition_started: TrendingUp,
  competition_ended: TrendingUp,
  team_joined: Users,
};

export function NotificationPanel() {
  const { notifications, markAsRead, markAllAsRead } = useNotifications();

  if (notifications.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Inga notifikationer
      </div>
    );
  }

  return (
    <div className="w-80">
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="text-sm font-semibold">Notifikationer</h3>
        <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs">
          Markera alla som lästa
        </Button>
      </div>
      <ScrollArea className="max-h-96">
        <div className="divide-y">
          {notifications.map((notif) => {
            const Icon = TYPE_ICONS[notif.type] || Bell;
            const isUnread = !notif.read_at;

            return (
              <button
                key={notif.id}
                className={`w-full flex items-start gap-3 p-3 text-left hover:bg-muted transition-colors ${
                  isUnread ? "bg-primary/5" : ""
                }`}
                onClick={() => {
                  if (isUnread) markAsRead([notif.id]);
                }}
              >
                <div className={`mt-0.5 ${isUnread ? "text-primary" : "text-muted-foreground"}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${isUnread ? "font-semibold" : ""}`}>
                    {notif.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{notif.body}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: sv })}
                  </p>
                </div>
                {isUnread && (
                  <div className="mt-1.5 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
