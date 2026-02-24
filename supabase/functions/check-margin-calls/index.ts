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
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all open short positions
    const { data: positions } = await supabase
      .from("short_positions")
      .select("*")
      .is("closed_at", null);

    if (!positions || positions.length === 0) {
      return new Response(JSON.stringify({ message: "No open shorts", checked: 0, forced: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tickers = [...new Set(positions.map((p) => p.ticker))];
    const priceMap: Record<string, { price: number; price_sek: number; currency: string; exchange_rate: number; stock_name: string }> = {};

    for (const ticker of tickers) {
      try {
        const priceUrl = `${supabaseUrl}/functions/v1/fetch-stock-price?ticker=${encodeURIComponent(ticker)}`;
        const resp = await fetch(priceUrl, {
          headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
        });
        const data = await resp.json();
        if (data.price) {
          priceMap[ticker] = {
            price: data.price,
            price_sek: data.price_sek,
            currency: data.currency,
            exchange_rate: data.exchange_rate,
            stock_name: data.stock_name,
          };
        }
      } catch (e) {
        console.error(`Failed to fetch price for ${ticker}:`, e);
      }
    }

    let forced = 0;

    for (const pos of positions) {
      const priceInfo = priceMap[pos.ticker];
      if (!priceInfo) continue;

      const currentValue = Number(pos.shares) * priceInfo.price_sek;
      const minMargin = currentValue * 1.2; // 120% requirement

      if (Number(pos.margin_reserved_sek) < minMargin) {
        // Force cover
        try {
          const { data: coverResult } = await supabase.rpc("execute_cover", {
            _competition_id: pos.competition_id,
            _team_id: pos.team_id,
            _executed_by: pos.team_id, // system action
            _ticker: pos.ticker,
            _stock_name: priceInfo.stock_name,
            _shares: Number(pos.shares),
            _price_per_share: priceInfo.price,
            _currency: priceInfo.currency,
            _exchange_rate: priceInfo.exchange_rate,
            _total_sek: Math.round(currentValue * 100) / 100,
          });

          if (coverResult?.success) {
            forced++;
            await notifyTeamMembers(
              supabase,
              pos.team_id,
              "forced_cover",
              `Tvångscover: ${pos.ticker}`,
              `Din shortposition i ${pos.stock_name} (${pos.shares} st) har tvångstäckts p.g.a. marginalbrist.`,
              { ticker: pos.ticker, shares: pos.shares }
            );
          }
        } catch (e) {
          console.error(`Failed to force cover ${pos.ticker}:`, e);
        }
      }
    }

    return new Response(
      JSON.stringify({ message: "Margin check complete", checked: positions.length, forced }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("check-margin-calls error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
