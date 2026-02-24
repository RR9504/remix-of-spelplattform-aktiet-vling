import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const RANGE_MAP: Record<string, { interval: string; range: string }> = {
  "1w": { interval: "1h", range: "5d" },
  "1m": { interval: "1d", range: "1mo" },
  "3m": { interval: "1d", range: "3mo" },
  "1y": { interval: "1wk", range: "1y" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const ticker = url.searchParams.get("ticker");
    const competitionId = url.searchParams.get("competition_id");
    const range = url.searchParams.get("range") || "1m";

    if (!ticker) {
      return new Response(JSON.stringify({ error: "ticker required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch current price
    const priceUrl = `${supabaseUrl}/functions/v1/fetch-stock-price?ticker=${encodeURIComponent(ticker)}`;
    const priceResp = await fetch(priceUrl, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    });
    const priceData = await priceResp.json();

    // Fetch historical data from Yahoo Finance
    const rangeConfig = RANGE_MAP[range] || RANGE_MAP["1m"];
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${rangeConfig.interval}&range=${rangeConfig.range}`;

    let history: { date: string; close: number }[] = [];
    let peRatio: number | null = null;
    let marketCap: number | null = null;
    let week52High: number | null = null;
    let week52Low: number | null = null;
    let volume: number | null = null;
    let changePercent = 0;

    try {
      const yahooResp = await fetch(yahooUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (yahooResp.ok) {
        const yahooData = await yahooResp.json();
        const result = yahooData?.chart?.result?.[0];
        if (result) {
          const timestamps = result.timestamp || [];
          const closes = result.indicators?.quote?.[0]?.close || [];

          history = timestamps
            .map((ts: number, i: number) => ({
              date: new Date(ts * 1000).toISOString().split("T")[0],
              close: closes[i],
            }))
            .filter((h: { close: number }) => h.close !== null && h.close !== undefined);

          const meta = result.meta;
          changePercent = meta.regularMarketPrice && meta.previousClose
            ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100
            : 0;
          week52High = meta.fiftyTwoWeekHigh ?? null;
          week52Low = meta.fiftyTwoWeekLow ?? null;
          volume = meta.regularMarketVolume ?? null;
        }
      }
    } catch (e) {
      console.error("Yahoo chart fetch error:", e);
    }

    // Try to get fundamentals
    try {
      const summaryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=summaryDetail,defaultKeyStatistics`;
      const summResp = await fetch(summaryUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (summResp.ok) {
        const summData = await summResp.json();
        const detail = summData?.quoteSummary?.result?.[0]?.summaryDetail;
        const keyStats = summData?.quoteSummary?.result?.[0]?.defaultKeyStatistics;
        if (detail) {
          peRatio = detail.trailingPE?.raw ?? null;
          marketCap = detail.marketCap?.raw ?? null;
        }
        if (keyStats && !peRatio) {
          peRatio = keyStats.trailingPE?.raw ?? null;
        }
      }
    } catch {
      // Fine, fundamentals are optional
    }

    // Get owners in competition
    let owners: { team_id: string; team_name: string; shares: number }[] = [];
    if (competitionId) {
      const { data: holdings } = await supabase
        .from("team_holdings")
        .select("team_id, total_shares")
        .eq("competition_id", competitionId)
        .eq("ticker", ticker);

      if (holdings && holdings.length > 0) {
        const teamIds = holdings.map((h) => h.team_id);
        const { data: teams } = await supabase
          .from("teams")
          .select("id, name")
          .in("id", teamIds);

        owners = holdings.map((h) => ({
          team_id: h.team_id,
          team_name: teams?.find((t) => t.id === h.team_id)?.name || "Okänt lag",
          shares: Number(h.total_shares),
        }));
      }
    }

    // Get recent trades
    let recentTrades: any[] = [];
    if (competitionId) {
      const { data: trades } = await supabase
        .from("trades")
        .select("*")
        .eq("competition_id", competitionId)
        .eq("ticker", ticker)
        .order("executed_at", { ascending: false })
        .limit(10);
      recentTrades = trades || [];
    }

    return new Response(
      JSON.stringify({
        ticker,
        name: priceData.stock_name || ticker,
        price: priceData.price || 0,
        currency: priceData.currency || "SEK",
        exchange_rate: priceData.exchange_rate || 1,
        price_sek: priceData.price_sek || 0,
        change_percent: Math.round(changePercent * 100) / 100,
        pe_ratio: peRatio,
        market_cap: marketCap,
        week52_high: week52High,
        week52_low: week52Low,
        volume,
        history,
        owners,
        recent_trades: recentTrades,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("get-stock-details error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
