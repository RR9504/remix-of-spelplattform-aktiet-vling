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

    if (!competitionId) {
      return new Response(JSON.stringify({ error: "competition_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get competition info
    const { data: competition } = await supabase
      .from("competitions")
      .select("initial_balance")
      .eq("id", competitionId)
      .single();

    if (!competition) {
      return new Response(JSON.stringify({ error: "Competition not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startCapital = Number(competition.initial_balance);

    // Get all teams in competition
    const { data: compTeams } = await supabase
      .from("competition_teams")
      .select("team_id, cash_balance_sek, margin_reserved_sek")
      .eq("competition_id", competitionId);

    if (!compTeams || compTeams.length === 0) {
      return new Response(JSON.stringify({ leaderboard: [], start_capital: startCapital }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const teamIds = compTeams.map((ct) => ct.team_id);

    // Get team info
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name")
      .in("id", teamIds);

    // Get team members
    const { data: allMembers } = await supabase
      .from("team_members")
      .select("team_id, profiles(full_name, email)")
      .in("team_id", teamIds);

    // Get all holdings for these teams
    const { data: allHoldings } = await supabase
      .from("team_holdings")
      .select("*")
      .eq("competition_id", competitionId)
      .in("team_id", teamIds);

    // Get all short positions
    const { data: allShorts } = await supabase
      .from("short_positions")
      .select("*")
      .eq("competition_id", competitionId)
      .in("team_id", teamIds)
      .is("closed_at", null);

    // Get all relevant cached prices
    const holdingTickers = [...new Set((allHoldings || []).map((h) => h.ticker))];
    const shortTickers = [...new Set((allShorts || []).map((s) => s.ticker))];
    const tickers = [...new Set([...holdingTickers, ...shortTickers])];
    let priceMap: Record<string, number> = {};
    if (tickers.length > 0) {
      const { data: prices } = await supabase
        .from("stock_price_cache")
        .select("ticker, price_sek")
        .in("ticker", tickers);
      for (const p of prices || []) {
        priceMap[p.ticker] = Number(p.price_sek);
      }
    }

    // Build leaderboard
    const leaderboard = compTeams.map((ct) => {
      const team = teams?.find((t) => t.id === ct.team_id);
      const cash = Number(ct.cash_balance_sek);
      const marginReserved = Number(ct.margin_reserved_sek || 0);

      // Calculate holdings value
      const teamHoldings = (allHoldings || []).filter((h) => h.team_id === ct.team_id);
      let holdingsValue = 0;
      for (const h of teamHoldings) {
        const priceSek = priceMap[h.ticker] ?? Number(h.avg_cost_per_share_sek);
        holdingsValue += Number(h.total_shares) * priceSek;
      }

      // Calculate short liabilities
      const teamShorts = (allShorts || []).filter((s) => s.team_id === ct.team_id);
      let shortLiabilities = 0;
      for (const s of teamShorts) {
        const priceSek = priceMap[s.ticker] ?? Number(s.entry_price_sek);
        shortLiabilities += Number(s.shares) * priceSek;
      }

      // total_value = cash + long_holdings - short_liabilities
      // margin_reserved is NOT separate money — it's already included in cash_balance_sek
      const totalValue = cash + holdingsValue - shortLiabilities;
      const returnAmount = totalValue - startCapital;
      const returnPercent = startCapital > 0 ? (returnAmount / startCapital) * 100 : 0;

      const members = (allMembers || [])
        .filter((m) => m.team_id === ct.team_id)
        .map((m: any) => m.profiles?.full_name || m.profiles?.email || "Okänd");

      return {
        team_id: ct.team_id,
        team_name: team?.name || "Okänt lag",
        total_value: Math.round(totalValue * 100) / 100,
        cash: Math.round(cash * 100) / 100,
        holdings_value: Math.round(holdingsValue * 100) / 100,
        return_amount: Math.round(returnAmount * 100) / 100,
        return_percent: Math.round(returnPercent * 100) / 100,
        members,
      };
    });

    // Sort by total value descending and assign ranks
    leaderboard.sort((a, b) => b.total_value - a.total_value);
    const ranked = leaderboard.map((entry, i) => ({
      rank: i + 1,
      ...entry,
    }));

    return new Response(
      JSON.stringify({ leaderboard: ranked, start_capital: startCapital }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("get-leaderboard error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
