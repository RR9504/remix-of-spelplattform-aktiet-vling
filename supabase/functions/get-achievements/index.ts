import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const url = new URL(req.url);
    const profileId = url.searchParams.get("profile_id");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");

    // Create a user-scoped client to verify the JWT
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const { data: { user: authUser }, error: authError } = await createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    }).auth.getUser();

    if (authError || !authUser) {
      return new Response(JSON.stringify({ success: false, error: "Ogiltig token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If profile_id is provided, use it; otherwise use the authenticated user's ID
    const userId = profileId || authUser.id;

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
