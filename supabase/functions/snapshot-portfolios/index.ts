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

    const today = new Date().toISOString().split("T")[0];

    // Get all active competitions
    const { data: competitions } = await supabase
      .from("competitions")
      .select("id")
      .lte("start_date", today)
      .gte("end_date", today);

    if (!competitions || competitions.length === 0) {
      return new Response(JSON.stringify({ message: "No active competitions", snapshots: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSnapshots = 0;

    for (const comp of competitions) {
      // Get teams in this competition
      const { data: compTeams } = await supabase
        .from("competition_teams")
        .select("team_id, cash_balance_sek, margin_reserved_sek")
        .eq("competition_id", comp.id);

      if (!compTeams) continue;

      // Get holdings for all teams
      const teamIds = compTeams.map((ct) => ct.team_id);
      const { data: allHoldings } = await supabase
        .from("team_holdings")
        .select("*")
        .eq("competition_id", comp.id)
        .in("team_id", teamIds);

      // Get short positions
      const { data: allShorts } = await supabase
        .from("short_positions")
        .select("*")
        .eq("competition_id", comp.id)
        .in("team_id", teamIds)
        .is("closed_at", null);

      // Get cached prices
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

      for (const ct of compTeams) {
        const cash = Number(ct.cash_balance_sek);
        const marginReserved = Number(ct.margin_reserved_sek || 0);

        const teamHoldings = (allHoldings || []).filter((h) => h.team_id === ct.team_id);
        let holdingsValue = 0;
        for (const h of teamHoldings) {
          const priceSek = priceMap[h.ticker] ?? Number(h.avg_cost_per_share_sek);
          holdingsValue += Number(h.total_shares) * priceSek;
        }

        const teamShorts = (allShorts || []).filter((s) => s.team_id === ct.team_id);
        let shortLiabilities = 0;
        for (const s of teamShorts) {
          const priceSek = priceMap[s.ticker] ?? Number(s.entry_price_sek);
          shortLiabilities += Number(s.shares) * priceSek;
        }

        const totalValue = cash + holdingsValue - shortLiabilities + marginReserved;

        await supabase.from("portfolio_snapshots").upsert(
          {
            competition_id: comp.id,
            team_id: ct.team_id,
            snapshot_date: today,
            total_value_sek: Math.round(totalValue * 100) / 100,
            cash_sek: Math.round(cash * 100) / 100,
            holdings_value_sek: Math.round(holdingsValue * 100) / 100,
          },
          { onConflict: "competition_id,team_id,snapshot_date" }
        );
        totalSnapshots++;
      }
    }

    return new Response(
      JSON.stringify({ message: "Snapshots created", snapshots: totalSnapshots }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("snapshot-portfolios error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
