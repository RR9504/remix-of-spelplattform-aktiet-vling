import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { notifyTeamMembers } from "../_shared/notify.ts";

const POINTS_MAP: Record<number, number> = {
  1: 10,
  2: 7,
  3: 5,
  4: 3,
  5: 2,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
      return new Response(JSON.stringify({ error: "Ogiltig token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = authUser.id;

    const supabase = createClient(supabaseUrl, serviceKey);

    const { competition_id } = await req.json();

    if (!competition_id) {
      return new Response(JSON.stringify({ error: "competition_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get competition
    const { data: competition } = await supabase
      .from("competitions")
      .select("*")
      .eq("id", competition_id)
      .single();

    if (!competition) {
      return new Response(JSON.stringify({ error: "Competition not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only creator can finalize before end_date; anyone can finalize after it has ended
    const today = new Date().toISOString().split("T")[0];
    const isEnded = competition.end_date < today;
    if (competition.created_by !== userId && !isEnded) {
      return new Response(JSON.stringify({ error: "Bara tävlingens skapare kan finalisera innan den avslutats" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if already finalized — prevent duplicate processing and notifications
    const { data: existingScores } = await supabase
      .from("season_scores")
      .select("id")
      .eq("competition_id", competition_id)
      .limit(1);

    if (existingScores && existingScores.length > 0) {
      return new Response(
        JSON.stringify({ message: "Already finalized", scores: existingScores.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get leaderboard
    const leaderboardResp = await fetch(
      `${supabaseUrl}/functions/v1/get-leaderboard?competition_id=${competition_id}`,
      {
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      }
    );
    const leaderboardData = await leaderboardResp.json();
    const leaderboard = leaderboardData.leaderboard || [];
    const startCapital = leaderboardData.start_capital || Number(competition.initial_balance);

    if (leaderboard.length === 0) {
      return new Response(JSON.stringify({ message: "No teams to finalize" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert season scores
    const scores = leaderboard.map((entry: any) => ({
      team_id: entry.team_id,
      competition_id,
      final_rank: entry.rank,
      final_value: entry.total_value,
      final_return_percent: entry.return_percent,
      points: POINTS_MAP[entry.rank] || 1,
    }));

    const { error: upsertError } = await supabase
      .from("season_scores")
      .upsert(scores, { onConflict: "team_id,competition_id" });

    if (upsertError) {
      return new Response(JSON.stringify({ error: upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Notify all teams
    for (const entry of leaderboard) {
      await notifyTeamMembers(
        supabase,
        entry.team_id,
        "competition_ended",
        `Tävlingen "${competition.name}" är avslutad!`,
        `Ni slutade på plats ${entry.rank} med ${entry.return_percent.toFixed(1)}% avkastning.`,
        { competition_id, rank: entry.rank, return_percent: entry.return_percent, link: "/competitions" }
      );
    }

    // Award competition_winner achievement to first place
    if (leaderboard.length > 0) {
      const winner = leaderboard[0];
      const { data: winnerAchievement } = await supabase
        .from("achievements")
        .select("id")
        .eq("key", "competition_winner")
        .single();

      if (winnerAchievement) {
        const { data: winnerMembers } = await supabase
          .from("team_members")
          .select("profile_id")
          .eq("team_id", winner.team_id);

        for (const m of winnerMembers || []) {
          await supabase.from("user_achievements").upsert({
            profile_id: m.profile_id,
            achievement_id: winnerAchievement.id,
            competition_id,
          }, { onConflict: "profile_id,achievement_id,competition_id" });
        }
      }
    }

    return new Response(
      JSON.stringify({ message: "Competition finalized", scores: scores.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("finalize-competition error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
