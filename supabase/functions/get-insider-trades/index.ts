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
  companyName: string,
  fullName?: string,
): Promise<RawInsiderTrade[]> {
  try {
    // Search last 12 months
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const dateTo = now.toISOString().split("T")[0];
    const dateFrom = oneYearAgo.toISOString().split("T")[0];

    // Clean company name for FI search
    // stock_name examples: "Volvo B", "Volvo, AB ser. B", "H & M Hennes & Mauritz AB ser. B"
    // ticker fallback: "VOLV-B" → "VOLV"
    // FI search is fuzzy, so just extract the main company name part
    // Clean company name for FI search
    // Examples: "Volvo, AB ser. B" → "Volvo", "Ericsson B" → "Ericsson"
    const cleanName = companyName
      .replace(/,?\s+(ser\.\s*)?[A-Z]$/i, "")  // " ser. B", " B"
      .replace(/,?\s+AB(\s+\(publ\))?$/i, "")  // " AB", " AB (publ)"
      .replace(/-[A-Z]$/i, "")                  // "VOLV-B" → "VOLV"
      .replace(/[,;.]+$/, "")                   // trailing punctuation
      .trim();

    const params = new URLSearchParams({
      SearchFunctionType: "Insyn",
      Utgivare: cleanName,
      "Transaktionsdatum.From": dateFrom,
      "Transaktionsdatum.To": dateTo,
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
    return parseFiHtml(html, ticker, fullName);
  } catch (e) {
    console.error("FI scraping error:", e);
    return [];
  }
}

// Parse FI HTML response to extract insider trades
// fullName is used to filter results to the correct emittent (e.g. "AB Volvo (publ)" vs "Volvo Car AB")
function parseFiHtml(html: string, ticker: string, fullName?: string): RawInsiderTrade[] {
  const trades: RawInsiderTrade[] = [];

  // Extract tbody content
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return trades;

  const tbody = tbodyMatch[1];
  const rowRegex = /<tr>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td>([\s\S]*?)<\/td>/gi;
  const tagRegex = /<[^>]+>/g;

  // Decode HTML entities
  function decodeEntities(s: string): string {
    return s
      .replace(/&#160;/g, " ")
      .replace(/&#228;/g, "ä")
      .replace(/&#246;/g, "ö")
      .replace(/&#229;/g, "å")
      .replace(/&#196;/g, "Ä")
      .replace(/&#214;/g, "Ö")
      .replace(/&#197;/g, "Å")
      .replace(/&amp;/g, "&");
  }

  let rowMatch;
  while ((rowMatch = rowRegex.exec(tbody)) !== null) {
    const rowHtml = rowMatch[1];
    const cells: string[] = [];
    let cellMatch;

    cellRegex.lastIndex = 0;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(decodeEntities(cellMatch[1].replace(tagRegex, "").trim()));
    }

    // FI columns:
    // 0: Publiceringsdatum, 1: Emittent, 2: Person, 3: Befattning,
    // 4: Närstående, 5: Karaktär, 6: Instrumentnamn, 7: Instrumenttyp,
    // 8: ISIN, 9: Transaktionsdatum, 10: Volym, 11: Volymsenhet,
    // 12: Pris, 13: Valuta, 14: Status, 15: Detaljer
    if (cells.length < 13) continue;

    // Filter by emittent if fullName is provided
    // Strip "AB", "Aktiebolaget", "(publ)", "ser. X" to get core name
    // "AB Volvo (publ)" → "volvo", "Aktiebolaget Volvo" → "volvo", "Volvo Car AB (publ)" → "volvo car"
    if (fullName) {
      const strip = (s: string) => s.toLowerCase()
        .replace(/\baktiebolaget\b/gi, "")
        .replace(/\bab\b/gi, "")
        .replace(/\(publ\)/gi, "")
        .replace(/\bser\.\s*[a-z]\b/gi, "")
        .replace(/[,;.()]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const coreFull = strip(fullName);
      const coreEmittent = strip(cells[1]);
      // Require exact core match (handles "volvo" vs "volvo car")
      if (coreFull !== coreEmittent) continue;
    }

    const personName = cells[2] || "Okänd";
    const position = cells[3] || null;
    const transactionType = cells[5] || "";
    const dateStr = cells[9];
    const volumeStr = cells[10] || "";
    const priceStr = cells[12] || "";

    // Date is YYYY-MM-DD from FI
    if (!dateStr || !dateStr.match(/^\d{4}-\d{2}-\d{2}/)) continue;
    const formattedDate = dateStr.substring(0, 10);

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
      // Get company name: try stock_price_cache first, then Yahoo v8 chart API
      let companyName = "";
      let fullName = ""; // full legal name for emittent filtering
      const { data: stockCache } = await supabase
        .from("stock_price_cache")
        .select("stock_name")
        .eq("ticker", ticker)
        .single();
      companyName = stockCache?.stock_name || "";

      // Always try Yahoo v8 to get both shortName and longName
      try {
        const yahooUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
        const yahooResp = await fetch(yahooUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (yahooResp.ok) {
          const yahooData = await yahooResp.json();
          const meta = yahooData?.chart?.result?.[0]?.meta;
          if (!companyName || companyName.length < 3) {
            companyName = meta?.shortName || companyName;
          }
          fullName = meta?.longName || meta?.shortName || "";
        }
      } catch { /* ignore */ }

      if (!companyName) companyName = ticker.replace(".ST", "");

      // Try FI first
      trades = await fetchFromFI(ticker, companyName, fullName);

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

    // 4. Return fresh data — try cache first, fall back to in-memory trades
    const { data: result } = await supabase
      .from("insider_trades_cache")
      .select("*")
      .eq("ticker", ticker)
      .order("transaction_date", { ascending: false });

    // If cache write failed, return the fetched trades directly
    const finalTrades = (result && result.length > 0)
      ? result
      : trades.map((t) => ({ ...t, id: crypto.randomUUID(), fetched_at: new Date().toISOString() }));

    return new Response(
      JSON.stringify({ insider_trades: finalTrades }),
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
