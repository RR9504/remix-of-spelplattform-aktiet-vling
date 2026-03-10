import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface SearchResult {
  ticker: string;
  name: string;
  exchange: string;
  currency: string;
}

// Check if a ticker exists and has price data on Yahoo Finance
async function validateTicker(ticker: string): Promise<{ valid: boolean; name?: string; price?: number }> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return { valid: false };
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return { valid: false };
    const meta = result.meta || {};
    return {
      valid: true,
      name: meta.shortName || meta.longName || ticker,
      price: meta.regularMarketPrice,
    };
  } catch {
    return { valid: false };
  }
}

// Generate candidate certificate tickers for a Bull/Bear search
function generateCertificateCandidates(query: string): string[] {
  // Normalize: "BULL-OMXS" → direction=BULL, underlying=OMXS
  const normalized = query.toUpperCase().replace(/[\s]+/g, "-");
  const match = normalized.match(/^(BULL|BEAR)[- ]?(.+)/);
  if (!match) return [];

  const direction = match[1];
  let underlying = match[2].replace(/^-/, "");

  // Map common names to ticker fragments
  const aliases: Record<string, string[]> = {
    "OMXS30": ["OMX"],
    "OMXS": ["OMX"],
    "OMX": ["OMX"],
    "VOLVO": ["VOLV"],
    "VOLV": ["VOLV"],
    "ERICSSON": ["ERIC"],
    "ERIC": ["ERIC"],
    "HM": ["HM"],
    "H&M": ["HM"],
    "SEB": ["SEB"],
    "HANDELSBANKEN": ["SHB"],
    "SHB": ["SHB"],
    "TESLA": ["TSLA"],
    "TSLA": ["TSLA"],
    "NVIDIA": ["NVD", "NVDA"],
    "NVD": ["NVD"],
    "NVDA": ["NVD", "NVDA"],
    "APPLE": ["AAPL"],
    "AAPL": ["AAPL"],
    "SANDVIK": ["SAND"],
    "SAND": ["SAND"],
    "SAAB": ["SAAB"],
    "ABB": ["ABB"],
    "NORDEA": ["NDA"],
    "NDA": ["NDA"],
    "INVESTOR": ["INVE"],
    "INVE": ["INVE"],
    "ATLAS": ["ATCO"],
    "ATCO": ["ATCO"],
    "ASTRA": ["AZN"],
    "AZN": ["AZN"],
    "NIBE": ["NIBE"],
    "SKANSKA": ["SKA"],
    "SKA": ["SKA"],
    "SKF": ["SKF"],
    "TELIA": ["TELIA"],
    "SWEDBANK": ["SWED"],
    "SWED": ["SWED"],
    "SSAB": ["SSAB"],
    "BOLIDEN": ["BOL"],
    "BOL": ["BOL"],
    "EQT": ["EQT"],
    "HEXAGON": ["HEXA"],
    "HEXA": ["HEXA"],
    "GETINGE": ["GETI"],
    "GETI": ["GETI"],
    "EVOLUTION": ["EVO"],
    "EVO": ["EVO"],
  };

  const underlyings = aliases[underlying] || [underlying];
  const leverages = ["X2", "X3", "X5", "X8", "X10", "X15"];
  const issuers = ["H", "AVA", "SG", "NORDNET"];
  const series = ["", "-1", "-2", "-3", "-4", "-5", "-6", "-7", "-8", "-9", "-10", "-11", "-12", "-13", "-14", "-15"];

  const candidates: string[] = [];
  for (const u of underlyings) {
    for (const lev of leverages) {
      for (const issuer of issuers) {
        for (const s of series) {
          candidates.push(`${direction}-${u}-${lev}-${issuer}${s}.ST`);
        }
      }
    }
  }

  return candidates;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("query");

    if (!query || query.length < 1) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if this is a certificate search (BULL/BEAR pattern)
    const isCertSearch = /^(bull|bear)/i.test(query.trim());

    if (isCertSearch) {
      const candidates = generateCertificateCandidates(query.trim());
      const results: SearchResult[] = [];

      // Validate candidates in parallel batches of 10
      for (let i = 0; i < candidates.length && results.length < 15; i += 10) {
        const batch = candidates.slice(i, i + 10);
        const validations = await Promise.all(batch.map((t) => validateTicker(t)));

        for (let j = 0; j < batch.length; j++) {
          const v = validations[j];
          if (v.valid) {
            results.push({
              ticker: batch[j],
              name: v.name || batch[j],
              exchange: "Stockholm",
              currency: "SEK",
            });
          }
        }
      }

      // Also do a normal Yahoo search in case it finds something
      try {
        const yahooUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=false`;
        const response = await fetch(yahooUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (response.ok) {
          const data = await response.json();
          const allowedTypes = new Set(["EQUITY", "CRYPTOCURRENCY", "FUTURE"]);
          const yahooResults = (data.quotes || [])
            .filter((q: any) => allowedTypes.has(q.quoteType))
            .map((q: any) => ({
              ticker: q.symbol,
              name: q.shortname || q.longname || q.symbol,
              exchange: q.exchDisp || q.exchange || "",
              currency: q.currency || "SEK",
            }));

          // Add Yahoo results that aren't already in our list
          const seen = new Set(results.map((r) => r.ticker));
          for (const r of yahooResults) {
            if (!seen.has(r.ticker)) {
              results.push(r);
            }
          }
        }
      } catch {}

      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normal stock search
    const yahooUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=false`;

    const response = await fetch(yahooUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) {
      console.error("Yahoo Finance error:", response.status);
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const allowedTypes = new Set(["EQUITY", "CRYPTOCURRENCY", "FUTURE"]);
    const quotes = (data.quotes || [])
      .filter((q: any) => allowedTypes.has(q.quoteType))
      .map((q: any) => ({
        ticker: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        exchange: q.exchDisp || q.exchange || "",
        currency: q.currency || "SEK",
      }));

    return new Response(JSON.stringify(quotes), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("search-stocks error:", error);
    return new Response(JSON.stringify([]), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
