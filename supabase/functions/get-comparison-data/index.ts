import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const competitionId = url.searchParams.get("competition_id");
    const teamId = url.searchParams.get("team_id");

    if (!competitionId || !teamId) {
      return new Response(
        JSON.stringify({ error: "competition_id and team_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get competition details for start value
    const { data: competition } = await supabase
      .from("competitions")
      .select("initial_balance, start_date, end_date")
      .eq("id", competitionId)
      .single();

    if (!competition) {
      return new Response(
        JSON.stringify({ error: "Competition not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startValue = Number(competition.initial_balance);

    // Get all teams in the competition
    const { data: competitionTeams } = await supabase
      .from("competition_teams")
      .select("team_id, teams(name)")
      .eq("competition_id", competitionId);

    if (!competitionTeams || competitionTeams.length === 0) {
      return new Response(
        JSON.stringify({ error: "No teams in competition" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const teamIds = competitionTeams.map((ct: any) => ct.team_id);

    // Get portfolio snapshots for all teams
    const { data: snapshots } = await supabase
      .from("portfolio_snapshots")
      .select("team_id, snapshot_date, total_value_sek")
      .eq("competition_id", competitionId)
      .in("team_id", teamIds)
      .order("snapshot_date", { ascending: true });

    // Build team data
    const teams = competitionTeams.map((ct: any) => {
      const teamSnapshots = (snapshots || [])
        .filter((s: any) => s.team_id === ct.team_id)
        .map((s: any) => ({
          date: s.snapshot_date,
          value: Number(s.total_value_sek),
          return_percent: startValue > 0
            ? ((Number(s.total_value_sek) - startValue) / startValue) * 100
            : 0,
        }));

      return {
        team_id: ct.team_id,
        team_name: (ct.teams as any)?.name || "Okänt lag",
        snapshots: teamSnapshots,
      };
    });

    // Fetch OMXS30 benchmark data
    let benchmark = { name: "OMXS30", snapshots: [] as { date: string; return_percent: number }[] };

    try {
      // Determine period from competition dates
      const startDate = competition.start_date
        ? new Date(competition.start_date)
        : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const endDate = competition.end_date ? new Date(competition.end_date) : new Date();

      const period1 = Math.floor(startDate.getTime() / 1000);
      const period2 = Math.floor(endDate.getTime() / 1000);

      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/%5EOMX?period1=${period1}&period2=${period2}&interval=1d`;
      const yahooRes = await fetch(yahooUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      if (yahooRes.ok) {
        const yahooData = await yahooRes.json();
        const result = yahooData?.chart?.result?.[0];
        if (result) {
          const timestamps = result.timestamp || [];
          const closes = result.indicators?.quote?.[0]?.close || [];
          const firstClose = closes.find((c: number | null) => c != null) || 1;

          benchmark.snapshots = timestamps
            .map((ts: number, i: number) => {
              const close = closes[i];
              if (close == null) return null;
              const date = new Date(ts * 1000).toISOString().split("T")[0];
              const returnPercent = ((close - firstClose) / firstClose) * 100;
              return { date, return_percent: Math.round(returnPercent * 100) / 100 };
            })
            .filter(Boolean);
        }
      }
    } catch (e) {
      console.error("Failed to fetch benchmark data:", e);
      // Benchmark is optional, proceed without it
    }

    return new Response(
      JSON.stringify({
        teams,
        benchmark,
        start_value: startValue,
        my_team_id: teamId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("get-comparison-data error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
