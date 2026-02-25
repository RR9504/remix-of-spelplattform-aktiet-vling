import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

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

    // Get cash balance + margin
    const { data: ct } = await supabase
      .from("competition_teams")
      .select("cash_balance_sek, margin_reserved_sek")
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
    const marginReserved = Number(ct.margin_reserved_sek || 0);

    // Get holdings from view
    const { data: holdings } = await supabase
      .from("team_holdings")
      .select("*")
      .eq("competition_id", competitionId)
      .eq("team_id", teamId);

    // Get short positions
    const { data: shortPositions } = await supabase
      .from("short_positions")
      .select("*")
      .eq("competition_id", competitionId)
      .eq("team_id", teamId)
      .is("closed_at", null);

    // Collect all tickers that need prices
    const holdingTickers = (holdings || []).map((h) => h.ticker);
    const shortTickers = (shortPositions || []).map((s) => s.ticker);
    const allTickers = [...new Set([...holdingTickers, ...shortTickers])];

    // Fetch cached prices
    let priceMap: Record<string, { price: number; price_sek: number; updated_at: string }> = {};
    if (allTickers.length > 0) {
      const { data: cached } = await supabase
        .from("stock_price_cache")
        .select("ticker, price, price_sek, updated_at")
        .in("ticker", allTickers);
      for (const p of cached || []) {
        priceMap[p.ticker] = { price: Number(p.price), price_sek: Number(p.price_sek), updated_at: p.updated_at };
      }
    }

    // Refresh stale prices by calling fetch-stock-price
    const staleTickers = allTickers.filter((t) => {
      const cached = priceMap[t];
      if (!cached) return true;
      return (Date.now() - new Date(cached.updated_at).getTime()) > STALE_THRESHOLD_MS;
    });

    if (staleTickers.length > 0) {
      // Fetch stale prices in parallel (max 10 concurrent)
      const refreshPromises = staleTickers.map(async (ticker) => {
        try {
          const resp = await fetch(
            `${supabaseUrl}/functions/v1/fetch-stock-price?ticker=${encodeURIComponent(ticker)}`,
            { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } }
          );
          if (resp.ok) {
            const data = await resp.json();
            if (data.price_sek) {
              priceMap[ticker] = {
                price: Number(data.price),
                price_sek: Number(data.price_sek),
                updated_at: data.updated_at || new Date().toISOString(),
              };
            }
          }
        } catch (e) {
          console.error(`Failed to refresh price for ${ticker}:`, e);
        }
      });
      await Promise.all(refreshPromises);
    }

    // Enrich holdings
    let holdingsValue = 0;
    const enrichedHoldings = [];

    for (const h of holdings || []) {
      const cached = priceMap[h.ticker];
      const currentPriceSek = cached ? cached.price_sek : Number(h.avg_cost_per_share_sek);
      const currentPrice = cached ? cached.price : 0;
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
        stale: cached ? (Date.now() - new Date(cached.updated_at).getTime() > STALE_THRESHOLD_MS) : true,
      });
    }

    // Enrich short positions
    const enrichedShorts = [];
    let shortLiabilities = 0;

    for (const sp of shortPositions || []) {
      const cached = priceMap[sp.ticker];
      const currentPriceSek = cached ? cached.price_sek : Number(sp.entry_price_sek);
      const shares = Number(sp.shares);
      const entryPriceSek = Number(sp.entry_price_sek);
      const currentValue = shares * currentPriceSek;
      const entryValue = shares * entryPriceSek;
      const pnl = entryValue - currentValue;
      const pnlPercent = entryValue > 0 ? (pnl / entryValue) * 100 : 0;

      shortLiabilities += currentValue;

      enrichedShorts.push({
        id: sp.id,
        competition_id: sp.competition_id,
        team_id: sp.team_id,
        ticker: sp.ticker,
        stock_name: sp.stock_name,
        shares,
        entry_price_sek: entryPriceSek,
        margin_reserved_sek: Number(sp.margin_reserved_sek),
        current_price_sek: currentPriceSek,
        unrealized_pnl_sek: Math.round(pnl * 100) / 100,
        unrealized_pnl_percent: Math.round(pnlPercent * 100) / 100,
        opened_at: sp.opened_at,
        closed_at: sp.closed_at,
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

    // total_value = cash + long_holdings - short_liabilities
    // margin_reserved is NOT separate money — it's already included in cash_balance_sek
    const totalValue = cash + holdingsValue - shortLiabilities;

    // Upsert today's portfolio snapshot so the chart builds up daily
    const today = new Date().toISOString().split("T")[0];
    await supabase
      .from("portfolio_snapshots")
      .upsert(
        {
          competition_id: competitionId,
          team_id: teamId,
          snapshot_date: today,
          total_value_sek: Math.round(totalValue * 100) / 100,
          cash_sek: Math.round(cash * 100) / 100,
          holdings_value_sek: Math.round(holdingsValue * 100) / 100,
        },
        { onConflict: "competition_id,team_id,snapshot_date" }
      )
      .then(() => {});

    return new Response(
      JSON.stringify({
        cash,
        holdings: enrichedHoldings,
        total_value: Math.round(totalValue * 100) / 100,
        holdings_value: Math.round(holdingsValue * 100) / 100,
        recent_trades: recentTrades || [],
        short_positions: enrichedShorts,
        margin_reserved: marginReserved,
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
