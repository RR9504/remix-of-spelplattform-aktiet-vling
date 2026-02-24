import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get("team_id");
    const competitionId = url.searchParams.get("competition_id");

    if (!teamId) {
      return new Response(JSON.stringify({ error: "team_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get team info
    const { data: team } = await supabase
      .from("teams")
      .select("id, name, captain_id")
      .eq("id", teamId)
      .single();

    if (!team) {
      return new Response(JSON.stringify({ error: "Team not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get members
    const { data: members } = await supabase
      .from("team_members")
      .select("profile_id, profiles(full_name, email)")
      .eq("team_id", teamId);

    // Get achievements for team members
    const memberIds = (members || []).map((m) => m.profile_id);
    const { data: achievements } = await supabase
      .from("user_achievements")
      .select("*, achievements(*)")
      .in("profile_id", memberIds);

    // Get portfolio snapshots if competition specified
    let snapshots: any[] = [];
    let holdings: any[] = [];
    let showHoldings = false;

    if (competitionId) {
      // Get competition settings
      const { data: comp } = await supabase
        .from("competitions")
        .select("show_holdings, end_date")
        .eq("id", competitionId)
        .single();

      // Get snapshots
      const { data: snapshotData } = await supabase
        .from("portfolio_snapshots")
        .select("snapshot_date, total_value_sek")
        .eq("competition_id", competitionId)
        .eq("team_id", teamId)
        .order("snapshot_date", { ascending: true });
      snapshots = snapshotData || [];

      // Check if holdings should be shown
      if (comp) {
        const today = new Date().toISOString().split("T")[0];
        if (comp.show_holdings === "always") {
          showHoldings = true;
        } else if (comp.show_holdings === "after_end" && today > comp.end_date) {
          showHoldings = true;
        }
      }

      if (showHoldings) {
        const { data: holdingData } = await supabase
          .from("team_holdings")
          .select("*")
          .eq("competition_id", competitionId)
          .eq("team_id", teamId);
        holdings = holdingData || [];
      }
    }

    return new Response(
      JSON.stringify({
        team: {
          id: team.id,
          name: team.name,
          captain_id: team.captain_id,
        },
        members: (members || []).map((m: any) => ({
          profile_id: m.profile_id,
          name: m.profiles?.full_name || m.profiles?.email || "Okänd",
          is_captain: m.profile_id === team.captain_id,
        })),
        achievements: (achievements || []).map((a: any) => ({
          ...a,
          achievement: a.achievements,
        })),
        snapshots,
        holdings: showHoldings ? holdings : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("get-team-profile error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
