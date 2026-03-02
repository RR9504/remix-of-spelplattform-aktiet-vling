import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { notifyTeamMembers } from "../_shared/notify.ts";

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
      if (!userId) throw new Error("No sub in JWT");
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Ogiltig token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { competition_id, team_id, ticker, side, shares } = await req.json();

    if (!competition_id || !team_id || !ticker || !side || !shares || shares <= 0) {
      return new Response(JSON.stringify({ success: false, error: "Ogiltiga parametrar" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validSides = ["buy", "sell", "short", "cover"];
    if (!validSides.includes(side)) {
      return new Response(JSON.stringify({ success: false, error: "Ogiltig handelstyp" }), {
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
    if (today < competition.start_date) {
      return new Response(JSON.stringify({ success: false, error: "Tävlingen har inte startat ännu" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (today > competition.end_date) {
      return new Response(JSON.stringify({ success: false, error: "Tävlingen är avslutad" }), {
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

    // Check if relevant market is open (CET/Stockholm timezone)
    const now = new Date();
    const cet = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Stockholm" }));
    const day = cet.getDay();
    const time = cet.getHours() * 60 + cet.getMinutes();
    const isSE = ticker.endsWith(".ST");
    const isWeekday = day >= 1 && day <= 5;
    const seOpen = isWeekday && time >= 9 * 60 && time <= 17 * 60 + 30;
    const usOpen = isWeekday && time >= 15 * 60 + 30 && time <= 22 * 60;
    const marketOpen = isSE ? seOpen : usOpen;

    if (!marketOpen) {
      return new Response(JSON.stringify({
        success: false,
        error: "Börsen är stängd. Använd limitorder för att handla utanför öppettider.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch current stock price
    const priceUrl = `${supabaseUrl}/functions/v1/fetch-stock-price?ticker=${encodeURIComponent(ticker)}`;
    const priceResp = await fetch(priceUrl, {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    });
    const priceData = await priceResp.json();

    if (!priceData.price) {
      return new Response(JSON.stringify({ success: false, error: "Kunde inte hämta aktiekurs för " + ticker }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalSek = shares * priceData.price * (priceData.exchange_rate || 1);

    let tradeResult: any;
    let tradeError: any;

    if (side === "short") {
      // Execute short sale
      const result = await supabase.rpc("execute_short", {
        _competition_id: competition_id,
        _team_id: team_id,
        _executed_by: userId,
        _ticker: ticker,
        _stock_name: priceData.stock_name || ticker,
        _shares: shares,
        _price_per_share: priceData.price,
        _currency: priceData.currency || "SEK",
        _exchange_rate: priceData.exchange_rate || 1,
        _total_sek: Math.round(totalSek * 100) / 100,
      });
      tradeResult = result.data;
      tradeError = result.error;
    } else if (side === "cover") {
      // Execute cover
      const result = await supabase.rpc("execute_cover", {
        _competition_id: competition_id,
        _team_id: team_id,
        _executed_by: userId,
        _ticker: ticker,
        _stock_name: priceData.stock_name || ticker,
        _shares: shares,
        _price_per_share: priceData.price,
        _currency: priceData.currency || "SEK",
        _exchange_rate: priceData.exchange_rate || 1,
        _total_sek: Math.round(totalSek * 100) / 100,
      });
      tradeResult = result.data;
      tradeError = result.error;
    } else {
      // Execute regular buy/sell
      const result = await supabase.rpc("execute_trade", {
        _competition_id: competition_id,
        _team_id: team_id,
        _executed_by: userId,
        _ticker: ticker,
        _stock_name: priceData.stock_name || ticker,
        _side: side,
        _shares: shares,
        _price_per_share: priceData.price,
        _currency: priceData.currency || "SEK",
        _exchange_rate: priceData.exchange_rate || 1,
        _total_sek: Math.round(totalSek * 100) / 100,
      });
      tradeResult = result.data;
      tradeError = result.error;
    }

    if (tradeError) {
      console.error("Trade RPC error:", tradeError);
      return new Response(JSON.stringify({ success: false, error: tradeError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send notification to team members
    if (tradeResult?.success) {
      const sideLabel = side === "buy" ? "Köpt" : side === "sell" ? "Sålt" : side === "short" ? "Blankat" : "Täckt";
      try {
        await notifyTeamMembers(
          supabase,
          team_id,
          "trade_executed",
          `${sideLabel} ${shares} st ${ticker}`,
          `${sideLabel} ${shares} st ${priceData.stock_name || ticker} för ${Math.round(totalSek)} SEK`,
          { trade_id: tradeResult.trade_id, ticker, side, shares, total_sek: Math.round(totalSek * 100) / 100 }
        );
      } catch (e) {
        console.error("Failed to send trade notification:", e);
      }

      // Trigger achievement check
      try {
        await fetch(`${supabaseUrl}/functions/v1/check-achievements`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ competition_id, team_id, user_id: userId }),
        });
      } catch (e) {
        console.error("Failed to check achievements:", e);
      }
    }

    return new Response(JSON.stringify(tradeResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("execute-trade error:", error);
    return new Response(JSON.stringify({ success: false, error: "Internt fel: " + (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
