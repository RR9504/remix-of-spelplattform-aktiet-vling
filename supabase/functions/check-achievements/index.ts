import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { createNotification } from "../_shared/notify.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { competition_id, team_id, user_id } = await req.json();
    if (!competition_id || !team_id || !user_id) {
      return new Response(JSON.stringify({ checked: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all achievements
    const { data: achievements } = await supabase.from("achievements").select("*");
    if (!achievements) {
      return new Response(JSON.stringify({ checked: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get already unlocked for this user in this competition
    const { data: existing } = await supabase
      .from("user_achievements")
      .select("achievement_id")
      .eq("profile_id", user_id)
      .eq("competition_id", competition_id);

    const unlockedIds = new Set((existing || []).map((e) => e.achievement_id));

    // Get trade count for user in this competition
    const { count: tradeCount } = await supabase
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("competition_id", competition_id)
      .eq("team_id", team_id);

    // Get short count
    const { count: shortCount } = await supabase
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("competition_id", competition_id)
      .eq("team_id", team_id)
      .eq("side", "short");

    // Get holdings count
    const { data: holdings } = await supabase
      .from("team_holdings")
      .select("ticker")
      .eq("competition_id", competition_id)
      .eq("team_id", team_id);
    const holdingsCount = holdings?.length ?? 0;

    // Get portfolio value for return calculation
    const { data: ct } = await supabase
      .from("competition_teams")
      .select("cash_balance_sek")
      .eq("competition_id", competition_id)
      .eq("team_id", team_id)
      .single();

    const { data: competition } = await supabase
      .from("competitions")
      .select("initial_balance")
      .eq("id", competition_id)
      .single();

    let returnPercent = 0;
    if (ct && competition) {
      // Simple estimate (just cash for now - full portfolio value would need price lookup)
      const cash = Number(ct.cash_balance_sek);
      const initial = Number(competition.initial_balance);
      // This is a rough estimate - the actual return needs portfolio value
      returnPercent = ((cash - initial) / initial) * 100;
    }

    let unlocked = 0;

    for (const achievement of achievements) {
      if (unlockedIds.has(achievement.id)) continue;

      const criteria = achievement.criteria as Record<string, unknown>;
      let earned = false;

      switch (achievement.key) {
        case "first_trade":
          earned = (tradeCount ?? 0) >= 1;
          break;
        case "ten_trades":
          earned = (tradeCount ?? 0) >= 10;
          break;
        case "fifty_trades":
          earned = (tradeCount ?? 0) >= 50;
          break;
        case "ten_percent_return":
          earned = returnPercent >= 10;
          break;
        case "doubled_capital":
          earned = returnPercent >= 100;
          break;
        case "diversified":
          earned = holdingsCount >= 5;
          break;
        case "first_short":
          earned = (shortCount ?? 0) >= 1;
          break;
        // bought_the_dip and competition_winner require more complex checks
        default:
          break;
      }

      if (earned) {
        const { error } = await supabase.from("user_achievements").insert({
          profile_id: user_id,
          achievement_id: achievement.id,
          competition_id,
        });

        if (!error) {
          unlocked++;
          await createNotification(
            supabase,
            user_id,
            "achievement_unlocked",
            `${achievement.icon} ${achievement.name}`,
            achievement.description,
            { achievement_key: achievement.key, achievement_id: achievement.id }
          );
        }
      }
    }

    return new Response(JSON.stringify({ checked: achievements.length, unlocked }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("check-achievements error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
