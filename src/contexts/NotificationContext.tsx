import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { getNotifications, markNotificationsRead } from "@/lib/api";
import { toast } from "sonner";
import { AchievementCelebration } from "@/components/AchievementCelebration";
import type { Notification } from "@/types/trading";

interface AchievementCelebrationData {
  icon: string;
  name: string;
  description: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (ids: string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  loading: true,
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  refresh: async () => {},
});

export const useNotifications = () => useContext(NotificationContext);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [celebration, setCelebration] = useState<AchievementCelebrationData | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    try {
      const data = await getNotifications({ limit: 30 });
      setNotifications(data);
    } catch (err) {
      console.error("NotificationContext refresh failed:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const markAsRead = useCallback(async (ids: string[]) => {
    await markNotificationsRead({ notification_ids: ids });
    setNotifications((prev) =>
      prev.map((n) =>
        ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n
      )
    );
  }, []);

  const markAllAsRead = useCallback(async () => {
    await markNotificationsRead({ all: true });
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );
  }, []);

  useEffect(() => {
    if (!user) {
      refresh();
      return;
    }
    // Delay notification fetch so it doesn't compete with critical data loading
    const timer = setTimeout(refresh, 2000);
    return () => clearTimeout(timer);
  }, [user]);

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev]);
          if (newNotif.type === "achievement_unlocked") {
            // Extract icon from title (format: "🏆 Achievement Name")
            const iconMatch = newNotif.title.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u);
            const icon = iconMatch ? iconMatch[1] : "🏆";
            const name = iconMatch ? newNotif.title.slice(iconMatch[0].length) : newNotif.title;
            setCelebration({ icon, name, description: newNotif.body });
          } else {
            toast(newNotif.title, { description: newNotif.body });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, loading, markAsRead, markAllAsRead, refresh }}
    >
      {children}
      {celebration && (
        <AchievementCelebration
          icon={celebration.icon}
          name={celebration.name}
          description={celebration.description}
          onDismiss={() => setCelebration(null)}
        />
      )}
    </NotificationContext.Provider>
  );
}
