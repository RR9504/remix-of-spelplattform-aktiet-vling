import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { notifyTeamMembers } from "../_shared/notify.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify caller is using service role key (cron jobs / internal calls only)
    const authHeader = req.headers.get("Authorization");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!authHeader || !authHeader.includes(serviceKey)) {
      return new Response(JSON.stringify({ error: "Unauthorized — service role required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all pending orders
    const { data: pendingOrders, error: fetchError } = await supabase
      .from("pending_orders")
      .select("*")
      .eq("status", "pending");

    if (fetchError || !pendingOrders || pendingOrders.length === 0) {
      return new Response(JSON.stringify({ message: "No pending orders", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    let filled = 0;
    let expired = 0;

    // Get unique tickers
    const tickers = [...new Set(pendingOrders.map((o) => o.ticker))];

    // Batch fetch prices
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

    for (const order of pendingOrders) {
      // Check expiration
      if (new Date(order.expires_at) < now) {
        // Release reserved funds for limit_buy orders
        if (order.order_type === "limit_buy" && Number(order.reserved_amount_sek) > 0) {
          await supabase.rpc("release_order_funds", { _order_id: order.id });
        }
        await supabase
          .from("pending_orders")
          .update({ status: "expired", reserved_amount_sek: 0 })
          .eq("id", order.id);
        expired++;

        // Notify team about expired order
        const typeLabel = order.order_type === "limit_buy" ? "Limitköp" :
          order.order_type === "limit_sell" ? "Limitsälj" :
          order.order_type === "stop_loss" ? "Stop-loss" : "Take-profit";
        try {
          await notifyTeamMembers(
            supabase,
            order.team_id,
            "order_expired",
            `Order utgången: ${order.ticker}`,
            `${typeLabel} för ${order.shares} st ${order.stock_name} har utgått.`,
            { order_id: order.id, ticker: order.ticker, order_type: order.order_type }
          );
        } catch (e) {
          console.error(`Failed to notify about expired order ${order.id}:`, e);
        }
        continue;
      }

      const priceInfo = priceMap[order.ticker];
      if (!priceInfo) continue;

      const currentPriceSek = priceInfo.price_sek;
      const targetPriceSek = order.target_price;
      let shouldFill = false;

      switch (order.order_type) {
        case "limit_buy":
          shouldFill = currentPriceSek <= targetPriceSek;
          break;
        case "limit_sell":
          shouldFill = currentPriceSek >= targetPriceSek;
          break;
        case "stop_loss":
          shouldFill = currentPriceSek <= targetPriceSek;
          break;
        case "take_profit":
          shouldFill = currentPriceSek >= targetPriceSek;
          break;
      }

      if (shouldFill) {
        const { data: result, error: fillError } = await supabase.rpc("fill_pending_order", {
          _order_id: order.id,
          _price_per_share: priceInfo.price,
          _currency: priceInfo.currency,
          _exchange_rate: priceInfo.exchange_rate,
          _stock_name: priceInfo.stock_name,
        });

        const typeLabel = order.order_type === "limit_buy" ? "Limitköp" :
          order.order_type === "limit_sell" ? "Limitsälj" :
          order.order_type === "stop_loss" ? "Stop-loss" : "Take-profit";

        if (!fillError && result?.success) {
          filled++;
          // Notify team about filled order
          try {
            const sideLabel = order.order_type === "limit_buy" ? "Köpt" : "Sålt";
            const totalSek = Math.round(order.shares * priceInfo.price_sek);
            await notifyTeamMembers(
              supabase,
              order.team_id,
              "order_filled",
              `${typeLabel} utförd: ${order.ticker}`,
              `${sideLabel} ${order.shares} st ${order.stock_name} för ${totalSek} SEK (${typeLabel.toLowerCase()}).`,
              { order_id: order.id, ticker: order.ticker, order_type: order.order_type, total_sek: totalSek }
            );
          } catch (e) {
            console.error(`Failed to notify about filled order ${order.id}:`, e);
          }
        } else {
          console.error(`Failed to fill order ${order.id}:`, fillError || result?.error);
          // Notify team about failed order
          try {
            await notifyTeamMembers(
              supabase,
              order.team_id,
              "order_failed",
              `${typeLabel} misslyckades: ${order.ticker}`,
              `${typeLabel} för ${order.shares} st ${order.stock_name} kunde inte utföras: ${result?.error || fillError?.message || "Okänt fel"}`,
              { order_id: order.id, ticker: order.ticker, order_type: order.order_type }
            );
          } catch (e) {
            console.error(`Failed to notify about failed order ${order.id}:`, e);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ message: "Processing complete", filled, expired, total: pendingOrders.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("process-pending-orders error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
