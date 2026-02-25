import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const CACHE_TTL_HOURS = 24;

interface RawInsiderTrade {
  ticker: string;
  transaction_date: string;
  insider_name: string;
  title: string | null;
  transaction_type: string;
  shares: number | null;
  value_sek: number | null;
  source: string;
}

// Map Yahoo transactionText to our types
function mapYahooTransactionType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("purchase") || lower.includes("buy")) return "buy";
  if (lower.includes("sale") || lower.includes("sell")) return "sell";
  if (lower.includes("exercise")) return "exercise";
  return "other";
}

// Map FI transaction type to our types
function mapFiTransactionType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("förvärv") || lower.includes("köp")) return "buy";
  if (lower.includes("avyttring") || lower.includes("sälj")) return "sell";
  return "other";
}

// Get Yahoo crumb + cookie for authenticated API calls
async function getYahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  try {
    // Step 1: Hit fc.yahoo.com to get cookies
    const initResp = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "manual",
    });
    const setCookies = initResp.headers.get("set-cookie") || "";
    // Extract cookie values we need to send back
    const cookies = setCookies
      .split(",")
      .map((c) => c.split(";")[0].trim())
      .filter((c) => c.length > 0)
      .join("; ");

    // Step 2: Get crumb using the cookies
    const crumbResp = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Cookie: cookies,
      },
    });
    if (!crumbResp.ok) {
      console.error(`Yahoo crumb fetch failed: ${crumbResp.status}`);
      return null;
    }
    const crumb = await crumbResp.text();
    return { crumb, cookie: cookies };
  } catch (e) {
    console.error("Yahoo crumb error:", e);
    return null;
  }
}

// Fetch insider trades from Yahoo Finance
async function fetchFromYahoo(
  ticker: string,
  exchangeRate: number
): Promise<RawInsiderTrade[]> {
  // Get crumb + cookie first
  const auth = await getYahooCrumb();
  if (!auth) {
    console.error("Could not get Yahoo crumb");
    return [];
  }

  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=insiderTransactions&crumb=${encodeURIComponent(auth.crumb)}`;

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Cookie: auth.cookie,
    },
  });

  if (!resp.ok) {
    console.error(`Yahoo insider fetch failed: ${resp.status}`);
    return [];
  }

  const data = await resp.json();
  const transactions =
    data?.quoteSummary?.result?.[0]?.insiderTransactions?.transactions ?? [];

  const trades: RawInsiderTrade[] = [];

  for (const tx of transactions) {
    const dateStr = tx?.startDate?.fmt;
    if (!dateStr) continue;

    const name = tx?.filerName || "Unknown";
    const transactionText = tx?.transactionText || "";
    const shares = tx?.shares?.raw ?? null;
    const valueUsd = tx?.value?.raw ?? null;

    trades.push({
      ticker,
      transaction_date: dateStr,
      insider_name: name,
      title: tx?.filerRelation || null,
      transaction_type: mapYahooTransactionType(transactionText),
      shares,
      value_sek: valueUsd != null ? Math.round(valueUsd * exchangeRate) : null,
      source: "yahoo",
    });
  }

  return trades;
}

// Fetch insider trades from Finansinspektionen
async function fetchFromFI(
  ticker: string,
  companyName: string
): Promise<RawInsiderTrade[]> {
  try {
    // Search last 12 months
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const dateTo = now.toISOString().split("T")[0];
    const dateFrom = oneYearAgo.toISOString().split("T")[0];

    // Clean company name: remove suffixes like " B", " A" etc
    const cleanName = companyName
      .replace(/\s+[A-Z]$/, "")
      .replace(/\s+AB$/, "")
      .trim();

    const params = new URLSearchParams({
      SearchFunctionType: "Insyn",
      Issuer: cleanName,
      DateOfPeriodFrom: dateFrom,
      DateOfPeriodTo: dateTo,
    });

    const url = `https://marknadssok.fi.se/Publiceringsklient/sv-SE/Search/Search?${params}`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html",
      },
    });

    if (!resp.ok) {
      console.error(`FI fetch failed: ${resp.status}`);
      return [];
    }

    const html = await resp.text();
    return parseFiHtml(html, ticker);
  } catch (e) {
    console.error("FI scraping error:", e);
    return [];
  }
}

// Parse FI HTML response to extract insider trades
function parseFiHtml(html: string, ticker: string): RawInsiderTrade[] {
  const trades: RawInsiderTrade[] = [];

  // Find table rows in the search results
  // FI uses a table with columns: Publiceringsdatum, Utgivare, Person i ledande ställning,
  // Befattning, Typ av transaktion, Instrumenttyp, ISIN, Datum, Volym, Enhet, Pris, Valuta, Status
  const rowRegex = /<tr[^>]*class="[^"]*SearchResultRow[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const tagRegex = /<[^>]+>/g;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells: string[] = [];
    let cellMatch;

    // Reset regex
    cellRegex.lastIndex = 0;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cellMatch[1].replace(tagRegex, "").trim());
    }

    // Expected columns (indexes may vary):
    // 0: Publiceringsdatum, 1: Utgivare, 2: Person, 3: Befattning,
    // 4: Närstående, 5: Typ av transaktion, 6: Instrumenttyp, 7: ISIN,
    // 8: Datum, 9: Volym, 10: Enhet, 11: Pris, 12: Valuta, 13: Status
    if (cells.length < 10) continue;

    const personName = cells[2] || "Okänd";
    const position = cells[3] || null;
    const transactionType = cells[5] || "";
    const dateStr = cells[8] || cells[0];
    const volumeStr = cells[9] || "";
    const priceStr = cells[11] || "";

    // Parse date (DD-MM-YYYY or YYYY-MM-DD)
    let formattedDate = "";
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      formattedDate = dateStr;
    } else if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
      const [d, m, y] = dateStr.split("-");
      formattedDate = `${y}-${m}-${d}`;
    } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
      formattedDate = dateStr.substring(0, 10);
    } else {
      continue; // Skip if we can't parse the date
    }

    const volume = parseInt(volumeStr.replace(/\s/g, "").replace(/,/g, ""), 10) || null;
    const price = parseFloat(priceStr.replace(/\s/g, "").replace(/,/g, ".")) || null;
    const valueSek = volume && price ? Math.round(volume * price) : null;

    trades.push({
      ticker,
      transaction_date: formattedDate,
      insider_name: personName,
      title: position,
      transaction_type: mapFiTransactionType(transactionType),
      shares: volume,
      value_sek: valueSek,
      source: "fi",
    });
  }

  return trades;
}

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

    // 1. Check cache
    const { data: cached } = await supabase
      .from("insider_trades_cache")
      .select("*")
      .eq("ticker", ticker)
      .gt("fetched_at", new Date(Date.now() - CACHE_TTL_HOURS * 3600_000).toISOString());

    if (cached && cached.length > 0) {
      return new Response(JSON.stringify({ insider_trades: cached }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Determine source and fetch
    const isSwedish = ticker.endsWith(".ST");
    let trades: RawInsiderTrade[] = [];

    if (isSwedish) {
      // Look up company name from stock_price_cache
      const { data: stockCache } = await supabase
        .from("stock_price_cache")
        .select("stock_name")
        .eq("ticker", ticker)
        .single();

      const companyName = stockCache?.stock_name || ticker.replace(".ST", "");

      // Try FI first
      trades = await fetchFromFI(ticker, companyName);

      // Fallback to Yahoo if FI fails
      if (trades.length === 0) {
        const { data: rateData } = await supabase
          .from("stock_price_cache")
          .select("exchange_rate")
          .eq("ticker", ticker)
          .single();
        const exchangeRate = rateData?.exchange_rate || 1;
        trades = await fetchFromYahoo(ticker, exchangeRate);
      }
    } else {
      // US/international stock → Yahoo
      const { data: rateData } = await supabase
        .from("stock_price_cache")
        .select("exchange_rate")
        .eq("ticker", ticker)
        .single();
      const exchangeRate = rateData?.exchange_rate || 10.85; // fallback USD→SEK
      trades = await fetchFromYahoo(ticker, exchangeRate);
    }

    // 3. Cache results
    if (trades.length > 0) {
      // Delete old cache entries for this ticker
      await supabase
        .from("insider_trades_cache")
        .delete()
        .eq("ticker", ticker)
        .lt("fetched_at", new Date(Date.now() - CACHE_TTL_HOURS * 3600_000).toISOString());

      // Upsert new trades
      const rows = trades.map((t) => ({
        ticker: t.ticker,
        transaction_date: t.transaction_date,
        insider_name: t.insider_name,
        title: t.title,
        transaction_type: t.transaction_type,
        shares: t.shares,
        value_sek: t.value_sek,
        source: t.source,
        fetched_at: new Date().toISOString(),
      }));

      await supabase
        .from("insider_trades_cache")
        .upsert(rows, { onConflict: "ticker,transaction_date,insider_name,transaction_type" });
    }

    // 4. Return fresh data
    const { data: result } = await supabase
      .from("insider_trades_cache")
      .select("*")
      .eq("ticker", ticker)
      .order("transaction_date", { ascending: false });

    return new Response(
      JSON.stringify({ insider_trades: result || [] }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("get-insider-trades error:", error);
    return new Response(JSON.stringify({ error: "Internal error", insider_trades: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
