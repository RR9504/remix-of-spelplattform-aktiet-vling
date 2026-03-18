import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { notifyTeamMembers } from "../_shared/notify.ts";

function formatNum(n: number): string {
  return Math.round(n).toLocaleString("sv-SE");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authUser) {
      return new Response(JSON.stringify({ success: false, error: "Ogiltig token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = authUser.id;

    const { competition_id, team_id, action, amount } = await req.json();

    if (!competition_id || !team_id || !action || !amount || amount <= 0) {
      return new Response(JSON.stringify({ success: false, error: "Ogiltiga parametrar" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action !== "deposit" && action !== "withdraw") {
      return new Response(JSON.stringify({ success: false, error: "Ogiltig åtgärd" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate team membership
    const { data: membership } = await supabase
      .from("team_members")
      .select("id")
      .eq("team_id", team_id)
      .eq("profile_id", userId)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ success: false, error: "Du är inte medlem i detta lag" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate competition is active
    const { data: competition } = await supabase
      .from("competitions")
      .select("start_date, end_date")
      .eq("id", competition_id)
      .single();

    if (!competition) {
      return new Response(JSON.stringify({ success: false, error: "Tävlingen hittades inte" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().split("T")[0];
    if (today < competition.start_date) {
      return new Response(JSON.stringify({ success: false, error: "Tävlingen har inte startat ännu" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (today > competition.end_date) {
      return new Response(JSON.stringify({ success: false, error: "Tävlingen är avslutad" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roundedAmount = Math.round(amount * 100) / 100;

    let result;
    if (action === "deposit") {
      result = await supabase.rpc("execute_savings_deposit", {
        _competition_id: competition_id,
        _team_id: team_id,
        _executed_by: userId,
        _amount: roundedAmount,
      });
    } else {
      result = await supabase.rpc("execute_savings_withdraw", {
        _competition_id: competition_id,
        _team_id: team_id,
        _executed_by: userId,
        _amount: roundedAmount,
      });
    }

    if (result.error) {
      console.error("Savings RPC error:", result.error);
      return new Response(JSON.stringify({ success: false, error: result.error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rpcResult = result.data;

    if (rpcResult?.success) {
      const label = action === "deposit" ? "Satte in" : "Tog ut";
      try {
        await notifyTeamMembers(
          supabase,
          team_id,
          "savings_transaction",
          `${label} ${formatNum(roundedAmount)} SEK`,
          `${label} ${formatNum(roundedAmount)} SEK på Haull Ånnan sparkonto`,
          { action, amount: roundedAmount }
        );
      } catch (e) {
        console.error("Failed to send savings notification:", e);
      }
    }

    return new Response(JSON.stringify(rpcResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("savings-account error:", error);
    return new Response(JSON.stringify({ success: false, error: "Internt fel: " + (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
