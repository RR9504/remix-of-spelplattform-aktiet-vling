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
    let userId: string;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      userId = payload.sub;
      if (!userId) throw new Error("No sub");
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Ogiltig token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { competition_id, team_id, ticker, stock_name, order_type, target_price, shares, currency } = await req.json();

    if (!competition_id || !team_id || !ticker || !order_type || !target_price || !shares || shares <= 0) {
      return new Response(JSON.stringify({ success: false, error: "Ogiltiga parametrar" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validTypes = ["limit_buy", "limit_sell", "stop_loss", "take_profit"];
    if (!validTypes.includes(order_type)) {
      return new Response(JSON.stringify({ success: false, error: "Ogiltig ordertyp" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

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

    // For SL/TP, get reference avg cost
    let referenceAvgCostSek: number | null = null;
    if (order_type === "stop_loss" || order_type === "take_profit" || order_type === "limit_sell") {
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
      referenceAvgCostSek = Number(holding.avg_cost_per_share_sek);
    }

    // Verify ticker exists
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
        target_price,
        shares,
        currency: currency || priceData.currency || "SEK",
        status: "pending",
        reference_avg_cost_sek: referenceAvgCostSek,
        expires_at: competition.end_date + "T23:59:59Z",
      })
      .select()
      .single();

    if (insertError) {
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
