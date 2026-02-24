import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const profileId = url.searchParams.get("profile_id");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If no profile_id, use the auth user
    let userId = profileId;
    if (!userId) {
      const token = authHeader.replace("Bearer ", "");
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        userId = payload.sub;
      } catch {
        return new Response(JSON.stringify({ error: "Ogiltig token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all achievements
    const { data: achievements } = await supabase
      .from("achievements")
      .select("*")
      .order("key");

    // Get user's unlocked achievements
    const { data: unlocked } = await supabase
      .from("user_achievements")
      .select("*, achievements(*)")
      .eq("profile_id", userId);

    return new Response(
      JSON.stringify({
        achievements: achievements || [],
        unlocked: (unlocked || []).map((u: any) => ({
          ...u,
          achievement: u.achievements,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("get-achievements error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
