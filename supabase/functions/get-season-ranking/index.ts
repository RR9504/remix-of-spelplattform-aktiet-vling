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
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all season scores
    const { data: scores } = await supabase
      .from("season_scores")
      .select("*");

    if (!scores || scores.length === 0) {
      return new Response(JSON.stringify({ ranking: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get team names
    const teamIds = [...new Set(scores.map((s) => s.team_id))];
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name")
      .in("id", teamIds);

    // Aggregate per team
    const teamStats: Record<string, {
      team_id: string;
      team_name: string;
      total_points: number;
      wins: number;
      podiums: number;
      competitions: number;
      total_rank: number;
    }> = {};

    for (const score of scores) {
      if (!teamStats[score.team_id]) {
        const team = teams?.find((t) => t.id === score.team_id);
        teamStats[score.team_id] = {
          team_id: score.team_id,
          team_name: team?.name || "Okänt lag",
          total_points: 0,
          wins: 0,
          podiums: 0,
          competitions: 0,
          total_rank: 0,
        };
      }

      const stats = teamStats[score.team_id];
      stats.total_points += score.points;
      stats.competitions += 1;
      stats.total_rank += score.final_rank;
      if (score.final_rank === 1) stats.wins += 1;
      if (score.final_rank <= 3) stats.podiums += 1;
    }

    const ranking = Object.values(teamStats)
      .map((s) => ({
        ...s,
        avg_rank: Math.round((s.total_rank / s.competitions) * 10) / 10,
      }))
      .sort((a, b) => b.total_points - a.total_points);

    return new Response(JSON.stringify({ ranking }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("get-season-ranking error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
