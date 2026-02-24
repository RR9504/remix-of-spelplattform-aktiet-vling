import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    let userId: string;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      userId = payload.sub;
      if (!userId) throw new Error("No sub");
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Ogiltig token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { competition_id, body } = await req.json();

    if (!competition_id || !body || typeof body !== "string") {
      return new Response(JSON.stringify({ success: false, error: "competition_id och body krävs" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.length > 500) {
      return new Response(JSON.stringify({ success: false, error: "Meddelandet får vara max 500 tecken" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check competition membership
    const { data: membership } = await supabase
      .from("competition_teams")
      .select("team_id")
      .eq("competition_id", competition_id);

    if (!membership || membership.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Tävling hittades inte" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const teamIds = membership.map((m) => m.team_id);
    const { data: isMember } = await supabase
      .from("team_members")
      .select("id")
      .eq("profile_id", userId)
      .in("team_id", teamIds)
      .limit(1);

    if (!isMember || isMember.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Du är inte med i denna tävling" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: message, error } = await supabase
      .from("competition_messages")
      .insert({
        competition_id,
        profile_id: userId,
        body: body.trim(),
      })
      .select()
      .single();

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-message error:", error);
    return new Response(JSON.stringify({ success: false, error: "Internt fel" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
