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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      return new Response(JSON.stringify({ success: false, error: "Ogiltig token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = authUser.id;

    const { competition_id, team_id, ticker, stock_name, order_type, target_price, shares, currency } = await req.json();

    // Market orders don't require target_price
    const isMarketOrder = ["market_buy", "market_sell", "market_short", "market_cover"].includes(order_type);

    if (!competition_id || !team_id || !ticker || !order_type || !shares || shares <= 0) {
      return new Response(JSON.stringify({ success: false, error: "Ogiltiga parametrar" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isMarketOrder && (!target_price || target_price <= 0)) {
      return new Response(JSON.stringify({ success: false, error: "Riktkurs krävs för denna ordertyp" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (shares > 100000) {
      return new Response(JSON.stringify({ success: false, error: "Max 100 000 aktier per order" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validTypes = [
      "limit_buy", "limit_sell", "stop_loss", "take_profit",
      "market_buy", "market_sell", "market_short", "market_cover",
    ];
    if (!validTypes.includes(order_type)) {
      return new Response(JSON.stringify({ success: false, error: "Ogiltig ordertyp" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate team membership
    const { data: membership } = await supabase
      .from("team_members")
      .select("id")
      .eq("team_id", team_id)
      .eq("profile_id", userId)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ success: false, error: "Du är inte medlem i detta lag" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate competition exists and is active
    const { data: competition } = await supabase
      .from("competitions")
      .select("*")
      .eq("id", competition_id)
      .single();

    if (!competition) {
      return new Response(JSON.stringify({ success: false, error: "Tävlingen hittades inte" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().split("T")[0];
    if (today < competition.start_date || today > competition.end_date) {
      return new Response(JSON.stringify({ success: false, error: "Tävlingen är inte aktiv" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate team is in competition
    const { data: ct } = await supabase
      .from("competition_teams")
      .select("id")
      .eq("competition_id", competition_id)
      .eq("team_id", team_id)
      .single();

    if (!ct) {
      return new Response(JSON.stringify({ success: false, error: "Laget är inte med i denna tävling" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine if this is a short-related order
    const forShort = order_type === "market_short" || order_type === "market_cover";

    // For sell-side orders (limit_sell, SL, TP, market_sell): validate holdings or short position
    if (["limit_sell", "stop_loss", "take_profit", "market_sell"].includes(order_type) && !forShort) {
      const { data: holding } = await supabase
        .from("team_holdings")
        .select("total_shares, avg_cost_per_share_sek")
        .eq("competition_id", competition_id)
        .eq("team_id", team_id)
        .eq("ticker", ticker)
        .single();

      if (!holding || Number(holding.total_shares) < shares) {
        return new Response(JSON.stringify({ success: false, error: "Otillräckligt antal aktier för denna order" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // For market_cover: validate short position exists
    if (order_type === "market_cover") {
      const { data: sp } = await supabase
        .from("short_positions")
        .select("shares")
        .eq("competition_id", competition_id)
        .eq("team_id", team_id)
        .eq("ticker", ticker)
        .is("closed_at", null)
        .single();

      if (!sp || Number(sp.shares) < shares) {
        return new Response(JSON.stringify({ success: false, error: "Otillräcklig blankningsposition" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Verify ticker exists and get current price
    const priceUrl = `${supabaseUrl}/functions/v1/fetch-stock-price?ticker=${encodeURIComponent(ticker)}`;
    const priceResp = await fetch(priceUrl, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });
    const priceData = await priceResp.json();

    if (!priceData.price) {
      return new Response(JSON.stringify({ success: false, error: "Kunde inte verifiera ticker: " + ticker }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For buy-side orders: reserve funds upfront
    let reservedAmountSek = 0;
    if (order_type === "limit_buy") {
      reservedAmountSek = Math.round(shares * target_price * 100) / 100;
    } else if (order_type === "market_buy") {
      // Reserve based on current price + 5% buffer for price movement
      reservedAmountSek = Math.round(shares * priceData.price_sek * 1.05 * 100) / 100;
    } else if (order_type === "market_short") {
      // Reserve margin: 150% of current value
      reservedAmountSek = Math.round(shares * priceData.price_sek * 1.5 * 100) / 100;
    }

    if (reservedAmountSek > 0) {
      const { data: ct2 } = await supabase
        .from("competition_teams")
        .select("cash_balance_sek, margin_reserved_sek")
        .eq("competition_id", competition_id)
        .eq("team_id", team_id)
        .single();

      if (!ct2) {
        return new Response(JSON.stringify({ success: false, error: "Laget hittades inte i tävlingen" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const availableCash = Number(ct2.cash_balance_sek) - Number(ct2.margin_reserved_sek);
      if (availableCash < reservedAmountSek) {
        return new Response(JSON.stringify({
          success: false,
          error: `Otillräckligt saldo. Tillgängligt: ${Math.round(availableCash)} SEK, behöver: ${Math.round(reservedAmountSek)} SEK`,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Deduct reserved amount from cash
      const { error: reserveError } = await supabase
        .from("competition_teams")
        .update({ cash_balance_sek: Number(ct2.cash_balance_sek) - reservedAmountSek })
        .eq("competition_id", competition_id)
        .eq("team_id", team_id);

      if (reserveError) {
        return new Response(JSON.stringify({ success: false, error: "Kunde inte reservera medel: " + reserveError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get reference avg cost for SL/TP on longs
    let referenceAvgCostSek: number | null = null;
    if ((order_type === "stop_loss" || order_type === "take_profit" || order_type === "limit_sell") && !forShort) {
      const { data: holding } = await supabase
        .from("team_holdings")
        .select("avg_cost_per_share_sek")
        .eq("competition_id", competition_id)
        .eq("team_id", team_id)
        .eq("ticker", ticker)
        .single();
      if (holding) {
        referenceAvgCostSek = Number(holding.avg_cost_per_share_sek);
      }
    }

    // Create pending order
    const { data: order, error: insertError } = await supabase
      .from("pending_orders")
      .insert({
        competition_id,
        team_id,
        created_by: userId,
        ticker,
        stock_name: stock_name || priceData.stock_name || ticker,
        order_type,
        target_price: isMarketOrder ? null : target_price,
        shares,
        currency: currency || priceData.currency || "SEK",
        status: "pending",
        reference_avg_cost_sek: referenceAvgCostSek,
        reserved_amount_sek: reservedAmountSek,
        for_short: forShort,
        expires_at: competition.end_date + "T23:59:59Z",
      })
      .select()
      .single();

    if (insertError) {
      // If order creation failed, release the reserved funds
      if (reservedAmountSek > 0) {
        const { data: ct3 } = await supabase
          .from("competition_teams")
          .select("cash_balance_sek")
          .eq("competition_id", competition_id)
          .eq("team_id", team_id)
          .single();
        if (ct3) {
          await supabase
            .from("competition_teams")
            .update({ cash_balance_sek: Number(ct3.cash_balance_sek) + reservedAmountSek })
            .eq("competition_id", competition_id)
            .eq("team_id", team_id);
        }
      }
      return new Response(JSON.stringify({ success: false, error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, order }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("place-order error:", error);
    return new Response(JSON.stringify({ success: false, error: "Internt fel" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
