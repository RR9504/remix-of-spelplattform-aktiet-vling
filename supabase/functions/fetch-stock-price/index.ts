import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const CACHE_TTL_MS = 60_000; // 1 minute

// Fallback exchange rates
const FALLBACK_RATES: Record<string, number> = {
  USD: 10.85,
  EUR: 11.50,
  GBP: 13.50,
  DKK: 1.54,
  NOK: 1.02,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const ticker = url.searchParams.get("ticker");

    if (!ticker) {
      return new Response(JSON.stringify({ error: "ticker required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Check cache first
    const { data: cached } = await supabase
      .from("stock_price_cache")
      .select("*")
      .eq("ticker", ticker)
      .single();

    if (cached) {
      const age = Date.now() - new Date(cached.updated_at).getTime();
      if (age < CACHE_TTL_MS) {
        return new Response(JSON.stringify(cached), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch from Yahoo Finance
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    let yahooData: any;
    let fetchOk = false;

    try {
      const response = await fetch(yahooUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (response.ok) {
        yahooData = await response.json();
        fetchOk = true;
      }
    } catch (e) {
      console.error("Yahoo fetch failed:", e);
    }

    if (!fetchOk || !yahooData?.chart?.result?.[0]) {
      // Fallback to stale cache
      if (cached) {
        return new Response(JSON.stringify({ ...cached, stale: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Could not fetch price" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = yahooData.chart.result[0];
    const meta = result.meta;
    const price = meta.regularMarketPrice ?? meta.previousClose;
    const currency = (meta.currency || "SEK").toUpperCase();
    const exchangeName = meta.exchangeName || meta.fullExchangeName || "";
    const stockName = meta.shortName || meta.longName || ticker;
    const previousClose = meta.previousClose;
    const changePercent = (price && previousClose && previousClose > 0)
      ? Math.round(((price - previousClose) / previousClose) * 10000) / 100
      : 0;

    // Get exchange rate for non-SEK currencies
    let exchangeRate = 1;
    if (currency !== "SEK") {
      try {
        const fxTicker = `${currency}SEK=X`;
        const fxUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${fxTicker}?interval=1d&range=1d`;
        const fxResp = await fetch(fxUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (fxResp.ok) {
          const fxData = await fxResp.json();
          const fxMeta = fxData?.chart?.result?.[0]?.meta;
          exchangeRate = fxMeta?.regularMarketPrice ?? fxMeta?.previousClose ?? (FALLBACK_RATES[currency] || 1);
        } else {
          exchangeRate = FALLBACK_RATES[currency] || 1;
        }
      } catch {
        exchangeRate = FALLBACK_RATES[currency] || 1;
      }
    }

    const priceSek = price * exchangeRate;

    const priceData = {
      ticker,
      price,
      currency,
      exchange_rate: exchangeRate,
      price_sek: Math.round(priceSek * 100) / 100,
      change_percent: changePercent,
      stock_name: stockName,
      exchange: exchangeName,
      updated_at: new Date().toISOString(),
    };

    // Upsert cache
    await supabase
      .from("stock_price_cache")
      .upsert(priceData, { onConflict: "ticker" });

    return new Response(JSON.stringify(priceData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("fetch-stock-price error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
