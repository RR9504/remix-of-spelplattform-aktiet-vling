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

    // Get portfolio value for return calculation — use latest snapshot for full value
    const { data: competition } = await supabase
      .from("competitions")
      .select("initial_balance")
      .eq("id", competition_id)
      .single();

    let returnPercent = 0;
    if (competition) {
      const initial = Number(competition.initial_balance);

      // Try latest portfolio snapshot (includes cash + holdings value)
      const { data: latestSnapshot } = await supabase
        .from("portfolio_snapshots")
        .select("total_value_sek")
        .eq("competition_id", competition_id)
        .eq("team_id", team_id)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .single();

      if (latestSnapshot) {
        returnPercent = ((Number(latestSnapshot.total_value_sek) - initial) / initial) * 100;
      } else {
        // Fallback to cash only if no snapshots exist yet
        const { data: ct } = await supabase
          .from("competition_teams")
          .select("cash_balance_sek")
          .eq("competition_id", competition_id)
          .eq("team_id", team_id)
          .single();
        if (ct) {
          returnPercent = ((Number(ct.cash_balance_sek) - initial) / initial) * 100;
        }
      }
    }

    // Check for bought_the_dip: did the team buy a stock below their average cost?
    let boughtTheDip = false;
    if (holdings && holdings.length > 0) {
      // Get the latest buy trade for this team
      const { data: latestBuy } = await supabase
        .from("trades")
        .select("ticker, price_per_share, exchange_rate")
        .eq("competition_id", competition_id)
        .eq("team_id", team_id)
        .eq("side", "buy")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (latestBuy) {
        // Get the avg cost for this ticker from team_holdings
        const { data: holding } = await supabase
          .from("team_holdings")
          .select("avg_cost_per_share_sek")
          .eq("competition_id", competition_id)
          .eq("team_id", team_id)
          .eq("ticker", latestBuy.ticker)
          .single();

        if (holding) {
          const buyPriceSek = Number(latestBuy.price_per_share) * Number(latestBuy.exchange_rate);
          const avgCost = Number(holding.avg_cost_per_share_sek);
          // Bought below avg cost (averaged down) — at least 5% below
          if (avgCost > 0 && buyPriceSek < avgCost * 0.95) {
            boughtTheDip = true;
          }
        }
      }
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
        case "bought_the_dip":
          earned = boughtTheDip;
          break;
        // competition_winner is handled by finalize-competition
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
