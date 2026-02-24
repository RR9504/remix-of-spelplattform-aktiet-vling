import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function createNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    type,
    title,
    body,
    data: data || null,
  });
  if (error) {
    console.error("Failed to create notification:", error);
  }
}

export async function notifyTeamMembers(
  supabase: ReturnType<typeof createClient>,
  teamId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  const { data: members } = await supabase
    .from("team_members")
    .select("profile_id")
    .eq("team_id", teamId);

  if (!members) return;

  const notifications = members.map((m) => ({
    user_id: m.profile_id,
    type,
    title,
    body,
    data: data || null,
  }));

  const { error } = await supabase.from("notifications").insert(notifications);
  if (error) {
    console.error("Failed to create team notifications:", error);
  }
}
