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

    // Get portfolio data if competition specified
    let snapshots: any[] = [];
    let holdings: any[] = [];
    let shortPositions: any[] = [];
    let trades: any[] = [];
    let portfolio: any = null;

    if (competitionId) {
      // Get competition settings
      const { data: comp } = await supabase
        .from("competitions")
        .select("initial_balance")
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

      // Get holdings enriched with current prices
      const { data: holdingData } = await supabase
        .from("team_holdings")
        .select("*")
        .eq("competition_id", competitionId)
        .eq("team_id", teamId);

      const rawHoldings = holdingData || [];

      // Get current prices for all tickers
      if (rawHoldings.length > 0) {
        const tickers = rawHoldings.map((h: any) => h.ticker);
        const { data: priceData } = await supabase
          .from("stock_price_cache")
          .select("ticker, price, currency, exchange_rate, price_sek, updated_at")
          .in("ticker", tickers);

        const priceMap = new Map(
          (priceData || []).map((p: any) => [p.ticker, p])
        );

        holdings = rawHoldings.map((h: any) => {
          const price = priceMap.get(h.ticker);
          const currentPriceSek = price?.price_sek ?? null;
          const costBasis = h.total_shares * h.avg_cost_per_share_sek;
          const marketValue = currentPriceSek ? h.total_shares * currentPriceSek : null;
          const unrealizedPnl = marketValue !== null ? marketValue - costBasis : null;
          const unrealizedPnlPercent = unrealizedPnl !== null && costBasis > 0
            ? (unrealizedPnl / costBasis) * 100
            : null;

          return {
            ticker: h.ticker,
            stock_name: h.stock_name,
            currency: h.currency,
            total_shares: h.total_shares,
            avg_cost_per_share_sek: h.avg_cost_per_share_sek,
            current_price_sek: currentPriceSek,
            market_value_sek: marketValue,
            unrealized_pnl_sek: unrealizedPnl,
            unrealized_pnl_percent: unrealizedPnlPercent,
          };
        });
      }

      // Get short positions
      const { data: shortData } = await supabase
        .from("short_positions")
        .select("*")
        .eq("competition_id", competitionId)
        .eq("team_id", teamId)
        .is("closed_at", null);
      shortPositions = shortData || [];

      // Get recent trades (last 20)
      const { data: tradeData } = await supabase
        .from("trades")
        .select("id, ticker, stock_name, side, shares, price_per_share, currency, exchange_rate, total_sek, realized_pnl_sek, executed_at")
        .eq("competition_id", competitionId)
        .eq("team_id", teamId)
        .order("executed_at", { ascending: false })
        .limit(20);
      trades = tradeData || [];

      // Get cash balance for portfolio summary
      const { data: compTeam } = await supabase
        .from("competition_teams")
        .select("cash_balance_sek, margin_reserved_sek")
        .eq("competition_id", competitionId)
        .eq("team_id", teamId)
        .single();

      if (compTeam) {
        const holdingsValue = holdings.reduce(
          (sum: number, h: any) => sum + (h.market_value_sek ?? 0),
          0
        );
        const shortMargin = compTeam.margin_reserved_sek ?? 0;
        const totalValue = compTeam.cash_balance_sek + holdingsValue + shortMargin;
        const startCapital = comp?.initial_balance ?? 0;
        const returnAmount = totalValue - startCapital;
        const returnPercent = startCapital > 0 ? (returnAmount / startCapital) * 100 : 0;

        portfolio = {
          cash: compTeam.cash_balance_sek,
          holdings_value: holdingsValue,
          margin_reserved: shortMargin,
          total_value: totalValue,
          start_capital: startCapital,
          return_amount: returnAmount,
          return_percent: returnPercent,
        };
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
        holdings,
        short_positions: shortPositions,
        trades,
        portfolio,
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
