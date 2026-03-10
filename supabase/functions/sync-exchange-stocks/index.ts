import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Search Yahoo Finance with many query patterns to discover .ST stocks
async function discoverStockholmStocks(): Promise<Array<{ ticker: string; name: string }>> {
  const stocks = new Map<string, string>();

  // Broad set of search queries designed to find Swedish stocks
  const queries = [
    // Common Swedish company name fragments
    "vol", "eri", "hm", "seb", "shb", "sand", "abb", "assa", "atco", "alfa",
    "bol", "eqt", "evo", "hex", "inv", "nord", "nibe", "teli", "swed", "skan",
    "saab", "sca", "skf", "ssab", "axfo", "elux", "cast", "dom", "bill",
    "geti", "esse", "fabg", "husq", "ica", "indt", "kinv", "lato", "lifco",
    "lund", "medi", "ncc", "nyfo", "peab", "saga", "secu", "sinch", "sobi",
    "swec", "tel2", "thul", "trel", "wall", "wihl", "brav", "hemn", "hufv",
    "aak", "addt", "arjo", "bure", "cate", "dust", "embra", "hpol", "htro",
    "jm", "lagr", "loom", "mips", "nola", "sect", "troax", "vite", "volo",
    "pand", "rato", "arion", "epir", "holmen", "intrum", "coor", "clas",
    "bufab", "fenix", "lime", "note", "oem", "resurs", "sysr", "sbb",
    "aza", "aliv", "ekta", "addl", "addno", "eltel", "enea", "know", "svol",
    "cint", "stor", "anod", "bioar", "celav", "cibus", "coll",
    "dios", "ework", "fast", "hoist",
    "myc", "nederm", "norf", "prev", "qliro", "sdip", "sved", "tobii",
    "veri", "xvivo", "bonav", "catella", "munter", "boozt", "kambi",
    "betsson", "kind", "fortn", "byggh", "creand", "wise", "xano",
    "acad", "alligo", "ambea", "bilia", "biot", "borg", "comp", "duni",
    "engc", "fing", "gran", "hanza", "havs", "idun", "itab", "kabe",
    "karo", "koppar", "lindb", "maha", "meab", "mend", "micro", "naxs",
    "nelly", "nola", "nore", "novot", "oper", "opus", "orio", "ortiv",
    "pric", "proac", "qlean", "rejl", "scand", "sensys", "senz",
    "spec", "stend", "tethys", "trac", "vbg", "vest", "wesc",
    "adven", "apex", "aros", "berg", "bewi", "brain", "carl", "cdon",
    "cherry", "concent", "core", "delt", "embr", "endom", "eniro",
    "filo", "flat", "font", "fpar", "g5", "haldex", "hansa", "hugo",
    "humana", "immu", "impact", "infant", "jetpak", "john", "klov",
    "lammh", "legio", "lex", "link", "mag", "maxf", "morg", "multi",
    "nil", "nob", "norm", "opti", "orex", "paya", "pharm", "plat",
    "polyg", "pred", "prime", "profi", "qlife", "reci", "ren",
    "sbc", "scib", "sed", "sensec", "spiff", "star", "stena", "stock",
    "stur", "svea", "swem", "train", "tran", "trelleb",
    "unib", "virg", "volat", "work", "xbra",
    // Direct ticker searches for known gaps
    "ABB.ST", "AZN.ST", "HM-B.ST", "SAND.ST", "VOLV-B.ST", "SEB-A.ST",
    "NDA-SE.ST", "TREL-B.ST", "WALL-B.ST", "EQT.ST", "NCC-B.ST",
    "DOM.ST", "CAST.ST", "INVE-B.ST", "SCA-B.ST", "ESSITY-B.ST",
    "HEXA-B.ST", "ICA.ST", "LUND-B.ST", "SECU-B.ST",
  ];

  for (const q of queries) {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=50&newsCount=0&listsCount=0&enableFuzzyQuery=false`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      if (!res.ok) continue;

      const data = await res.json();
      for (const quote of (data.quotes || [])) {
        if (quote.quoteType !== "EQUITY") continue;
        const ticker = quote.symbol as string;
        if (!ticker.endsWith(".ST")) continue;
        if (!stocks.has(ticker)) {
          stocks.set(ticker, quote.shortname || quote.longname || ticker);
        }
      }

      // Respect rate limits
      await new Promise((r) => setTimeout(r, 150));
    } catch {
      // Skip failed searches
    }
  }

  return Array.from(stocks.entries()).map(([ticker, name]) => ({ ticker, name }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const exchange = url.searchParams.get("exchange") || "XSTO";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if we synced recently (within 24 hours)
    const { data: existing } = await supabase
      .from("exchange_stocks")
      .select("updated_at")
      .eq("exchange", exchange)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (existing?.updated_at) {
      const age = Date.now() - new Date(existing.updated_at).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        const { count } = await supabase
          .from("exchange_stocks")
          .select("ticker", { count: "exact", head: true })
          .eq("exchange", exchange);

        return new Response(JSON.stringify({ synced: false, reason: "recent", count }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Discover stocks
    let stocks: Array<{ ticker: string; name: string }> = [];

    if (exchange === "XSTO") {
      stocks = await discoverStockholmStocks();
    }

    if (stocks.length === 0) {
      return new Response(JSON.stringify({ synced: false, reason: "no_results", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert into exchange_stocks
    const now = new Date().toISOString();
    const rows = stocks.map((s) => ({
      ticker: s.ticker,
      name: s.name,
      exchange,
      updated_at: now,
    }));

    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error } = await supabase
        .from("exchange_stocks")
        .upsert(chunk, { onConflict: "ticker" });

      if (error) console.error("Upsert error:", error);
    }

    return new Response(
      JSON.stringify({ synced: true, count: stocks.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("sync-exchange-stocks error:", error);
    return new Response(
      JSON.stringify({ error: "Sync failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
