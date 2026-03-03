import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { createNotification } from "../_shared/notify.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Service role only (cron job)
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

    // Get all watchlist items that have an alert threshold set
    const { data: alerts } = await supabase
      .from("watchlist")
      .select("id, profile_id, ticker, stock_name, alert_threshold_percent, last_alert_price_sek, last_alerted_at")
      .not("alert_threshold_percent", "is", null);

    if (!alerts || alerts.length === 0) {
      return new Response(JSON.stringify({ message: "No alerts configured", checked: 0, triggered: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get unique tickers
    const tickers = [...new Set(alerts.map((a) => a.ticker))];

    // Fetch current prices from cache
    const { data: prices } = await supabase
      .from("stock_price_cache")
      .select("ticker, price_sek")
      .in("ticker", tickers);

    const priceMap: Record<string, number> = {};
    for (const p of prices || []) {
      priceMap[p.ticker] = Number(p.price_sek);
    }

    let triggered = 0;
    const now = new Date();
    const cooldownMs = 4 * 60 * 60 * 1000; // 4 hour cooldown between alerts for same item

    for (const alert of alerts) {
      const currentPrice = priceMap[alert.ticker];
      if (!currentPrice) continue;

      const threshold = Number(alert.alert_threshold_percent);
      const lastAlertPrice = alert.last_alert_price_sek ? Number(alert.last_alert_price_sek) : null;
      const referencePrice = lastAlertPrice || currentPrice;

      // Skip if alerted recently (cooldown)
      if (alert.last_alerted_at) {
        const lastAlerted = new Date(alert.last_alerted_at);
        if (now.getTime() - lastAlerted.getTime() < cooldownMs) continue;
      }

      // If no reference price yet, just set it
      if (!lastAlertPrice) {
        await supabase
          .from("watchlist")
          .update({ last_alert_price_sek: currentPrice })
          .eq("id", alert.id);
        continue;
      }

      // Check if price changed beyond threshold
      const changePercent = ((currentPrice - referencePrice) / referencePrice) * 100;

      if (Math.abs(changePercent) >= threshold) {
        const direction = changePercent > 0 ? "upp" : "ner";
        const emoji = changePercent > 0 ? "\u{1f4c8}" : "\u{1f4c9}";
        const stockLabel = alert.stock_name || alert.ticker;

        await createNotification(
          supabase,
          alert.profile_id,
          "price_alert",
          `${emoji} Prisvarning: ${alert.ticker}`,
          `${stockLabel} har gått ${direction} ${Math.abs(changePercent).toFixed(1)}% (nu ${Math.round(currentPrice)} SEK)`,
          { ticker: alert.ticker, change_percent: Math.round(changePercent * 10) / 10, current_price: currentPrice }
        );

        // Update reference price and cooldown
        await supabase
          .from("watchlist")
          .update({
            last_alert_price_sek: currentPrice,
            last_alerted_at: now.toISOString(),
          })
          .eq("id", alert.id);

        triggered++;
      }
    }

    return new Response(
      JSON.stringify({ message: "Price alerts checked", checked: alerts.length, triggered }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("check-price-alerts error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
