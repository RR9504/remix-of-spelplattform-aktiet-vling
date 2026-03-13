import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { notifyTeamMembers } from "../_shared/notify.ts";

function formatNum(n: number): string {
  return Math.round(n).toLocaleString("sv-SE");
}

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

    const { competition_id, team_id, ticker, side, shares } = await req.json();

    if (!competition_id || !team_id || !ticker || !side || !shares || shares <= 0) {
      return new Response(JSON.stringify({ success: false, error: "Ogiltiga parametrar" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (shares > 10000000) {
      return new Response(JSON.stringify({ success: false, error: "Max 10 000 000 enheter per affär" }), {
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

    // Validate team membership + get team captain info and trade limit
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

    // Enforce competition rules
    const rules = competition.rules || {};
    const isSETicker = ticker.endsWith(".ST");

    if (rules.allow_shorts === false && (side === "short" || side === "cover")) {
      return new Response(JSON.stringify({ success: false, error: "Blankning är inte tillåten i denna tävling" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (rules.market_filter === "SE" && !isSETicker) {
      return new Response(JSON.stringify({ success: false, error: "Denna tävling tillåter bara svenska aktier" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (rules.market_filter === "US" && isSETicker) {
      return new Response(JSON.stringify({ success: false, error: "Denna tävling tillåter bara amerikanska aktier" }), {
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

    // Determine asset type from ticker
    const isCrypto = ticker.includes("-USD") || ticker.includes("-EUR") || ticker.includes("-GBP");
    const isCommodity = ticker.endsWith("=F");
    const isSE = ticker.endsWith(".ST");

    // Check if relevant market is open (CET/Stockholm timezone)
    // Crypto trades 24/7, commodities and stocks have market hours
    if (!isCrypto) {
      const now = new Date();
      const cet = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Stockholm" }));
      const day = cet.getDay();
      const time = cet.getHours() * 60 + cet.getMinutes();
      const isWeekday = day >= 1 && day <= 5;
      const seOpen = isWeekday && time >= 9 * 60 && time <= 17 * 60 + 30;
      const usOpen = isWeekday && time >= 15 * 60 + 30 && time <= 22 * 60;
      const marketOpen = isCommodity ? usOpen : (isSE ? seOpen : usOpen);

      if (!marketOpen) {
        return new Response(JSON.stringify({
          success: false,
          error: "Marknaden är stängd. Använd limitorder för att handla utanför öppettider.",
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
      return new Response(JSON.stringify({ success: false, error: "Kunde inte hämta pris för " + ticker }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSek = shares * priceData.price * (priceData.exchange_rate || 1);

    // Apply transaction fee if configured
    const feePct = Number(rules.transaction_fee_pct) || 0;
    if (feePct > 0 && (side === "buy" || side === "short")) {
      totalSek = totalSek * (1 + feePct / 100);
    } else if (feePct > 0 && (side === "sell" || side === "cover")) {
      totalSek = totalSek * (1 - feePct / 100);
    }
    totalSek = Math.round(totalSek * 100) / 100;

    // Max position size check (for buys only)
    if (rules.max_position_pct && side === "buy") {
      const maxPct = Number(rules.max_position_pct);
      if (maxPct > 0 && maxPct <= 100) {
        // Get latest portfolio snapshot or use initial_balance
        const { data: latestSnap } = await supabase
          .from("portfolio_snapshots")
          .select("total_value_sek")
          .eq("competition_id", competition_id)
          .eq("team_id", team_id)
          .order("snapshot_date", { ascending: false })
          .limit(1)
          .single();

        const portfolioValue = latestSnap ? Number(latestSnap.total_value_sek) : Number(competition.initial_balance);
        const maxPositionSek = portfolioValue * (maxPct / 100);

        if (totalSek > maxPositionSek) {
          return new Response(JSON.stringify({
            success: false,
            error: `Maximal positionsstorlek är ${maxPct}% av portföljen (${formatNum(maxPositionSek)} SEK)`,
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Check team trade limit for non-captain members
    const { data: teamRow } = await supabase
      .from("teams")
      .select("captain_id, max_trade_sek")
      .eq("id", team_id)
      .single();

    if (teamRow && teamRow.max_trade_sek && userId !== teamRow.captain_id) {
      const maxSek = Number(teamRow.max_trade_sek);
      if (totalSek > maxSek) {
        return new Response(JSON.stringify({
          success: false,
          error: `Handeln överskrider lagets gräns på ${formatNum(maxSek)} SEK per affär. Kontakta lagkaptenen.`,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

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
