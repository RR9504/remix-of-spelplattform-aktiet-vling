import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

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
    let userId: string;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      userId = payload.sub;
      if (!userId) throw new Error("No sub");
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Ogiltig token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { order_id } = await req.json();

    if (!order_id) {
      return new Response(JSON.stringify({ success: false, error: "order_id krävs" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Get order and validate ownership
    const { data: order } = await supabase
      .from("pending_orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (!order) {
      return new Response(JSON.stringify({ success: false, error: "Order hittades inte" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (order.created_by !== userId) {
      // Check if user is team member
      const { data: membership } = await supabase
        .from("team_members")
        .select("id")
        .eq("team_id", order.team_id)
        .eq("profile_id", userId)
        .single();

      if (!membership) {
        return new Response(JSON.stringify({ success: false, error: "Ingen behörighet att avbryta denna order" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (order.status !== "pending") {
      return new Response(JSON.stringify({ success: false, error: "Ordern är redan " + order.status }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cancel order
    const { error: updateError } = await supabase
      .from("pending_orders")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", order_id);

    if (updateError) {
      return new Response(JSON.stringify({ success: false, error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("cancel-order error:", error);
    return new Response(JSON.stringify({ success: false, error: "Internt fel" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
