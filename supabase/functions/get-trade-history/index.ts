import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const competitionId = url.searchParams.get("competition_id");
    const teamId = url.searchParams.get("team_id");
    const ticker = url.searchParams.get("ticker");
    const side = url.searchParams.get("side");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);

    if (!competitionId) {
      return new Response(JSON.stringify({ error: "competition_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let query = supabase
      .from("trades")
      .select("*", { count: "exact" })
      .eq("competition_id", competitionId);

    if (teamId) query = query.eq("team_id", teamId);
    if (ticker) query = query.eq("ticker", ticker);
    if (side) query = query.eq("side", side);
    if (from) query = query.gte("executed_at", from);
    if (to) query = query.lte("executed_at", to + "T23:59:59Z");

    const offset = (page - 1) * limit;
    query = query.order("executed_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: trades, count, error } = await query;

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ trades: trades || [], total: count || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("get-trade-history error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
