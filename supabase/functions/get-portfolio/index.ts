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
      return new Response(JSON.stringify({ error: "competition_id and team_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get cash balance
    const { data: ct } = await supabase
      .from("competition_teams")
      .select("cash_balance_sek")
      .eq("competition_id", competitionId)
      .eq("team_id", teamId)
      .single();

    if (!ct) {
      return new Response(JSON.stringify({ error: "Team not in competition" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cash = Number(ct.cash_balance_sek);

    // Get holdings from view
    const { data: holdings } = await supabase
      .from("team_holdings")
      .select("*")
      .eq("competition_id", competitionId)
      .eq("team_id", teamId);

    // Enrich holdings with current prices from cache
    let holdingsValue = 0;
    const enrichedHoldings = [];

    for (const h of holdings || []) {
      const { data: cached } = await supabase
        .from("stock_price_cache")
        .select("*")
        .eq("ticker", h.ticker)
        .single();

      const currentPriceSek = cached ? Number(cached.price_sek) : Number(h.avg_cost_per_share_sek);
      const currentPrice = cached ? Number(cached.price) : 0;
      const totalShares = Number(h.total_shares);
      const avgCost = Number(h.avg_cost_per_share_sek);
      const marketValueSek = totalShares * currentPriceSek;
      const costBasis = totalShares * avgCost;
      const pnl = marketValueSek - costBasis;
      const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

      holdingsValue += marketValueSek;

      enrichedHoldings.push({
        ticker: h.ticker,
        stock_name: h.stock_name,
        currency: h.currency,
        total_shares: totalShares,
        avg_cost_per_share_sek: avgCost,
        current_price_sek: currentPriceSek,
        current_price: currentPrice,
        market_value_sek: Math.round(marketValueSek * 100) / 100,
        unrealized_pnl_sek: Math.round(pnl * 100) / 100,
        unrealized_pnl_percent: Math.round(pnlPercent * 100) / 100,
        stale: cached ? (Date.now() - new Date(cached.updated_at).getTime() > 300_000) : true,
      });
    }

    // Get recent trades
    const { data: recentTrades } = await supabase
      .from("trades")
      .select("*")
      .eq("competition_id", competitionId)
      .eq("team_id", teamId)
      .order("executed_at", { ascending: false })
      .limit(10);

    const totalValue = cash + holdingsValue;

    return new Response(
      JSON.stringify({
        cash,
        holdings: enrichedHoldings,
        total_value: Math.round(totalValue * 100) / 100,
        holdings_value: Math.round(holdingsValue * 100) / 100,
        recent_trades: recentTrades || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("get-portfolio error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
