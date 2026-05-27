/**
 * Engångsanalys av en tävling i StockArena.
 *
 * Loggar in som en användare (RLS kräver authenticated) och hämtar ALL rådata
 * för en tävling: lag, trades, dagliga portfolio-snapshots, profiler.
 * Räknar fram statistik + roliga utmärkelser och skriver:
 *   - scripts/wolf-data.json   (rådump)
 *   - scripts/wolf-report.md    (rapport på svenska)
 *
 * Körs med:
 *   SB_EMAIL=... SB_PASS=... bun run scripts/analyze-competition.ts ["tävlingsnamn-delsträng"]
 *
 * Ingen extern dependency — bara fetch.
 */

const ROOT = new URL("..", import.meta.url).pathname;

// --- Läs URL + anon-nyckel ur .env ---
function readEnv(): { url: string; anon: string } {
  const txt = require("fs").readFileSync(ROOT + ".env", "utf8") as string;
  const get = (k: string) => {
    const m = txt.match(new RegExp(`^${k}=("?)(.*?)\\1\\s*$`, "m"));
    return m ? m[2] : "";
  };
  const url = get("VITE_SUPABASE_URL");
  const anon = get("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !anon) throw new Error("Hittade inte SUPABASE_URL / PUBLISHABLE_KEY i .env");
  return { url, anon };
}

const { url: SB_URL, anon: ANON } = readEnv();
const EMAIL = process.env.SB_EMAIL;
const PASS = process.env.SB_PASS;
const NAME_MATCH = (process.argv[2] || "wolf").toLowerCase();

// Access-token kan komma via env (SB_TOKEN) eller en lokal fil (scripts/.token)
function readTokenFile(): string {
  try {
    return (require("fs").readFileSync(ROOT + "scripts/.token", "utf8") as string).trim();
  } catch {
    return "";
  }
}
// Acceptera antingen en ren JWT eller hela localStorage-värdet (ev. "base64-"-prefix / JSON)
function extractToken(raw: string): string {
  let v = raw.trim();
  if (!v) return "";
  if (v.startsWith("base64-")) {
    try { v = atob(v.slice(7)); } catch { /* ignore */ }
  }
  if (v.startsWith("{") || v.startsWith("[")) {
    try {
      const o = JSON.parse(v);
      const obj = Array.isArray(o) ? o[0] : o;
      return obj?.access_token || obj?.currentSession?.access_token || "";
    } catch { /* ignore */ }
  }
  return v; // antas vara en ren access-token (JWT)
}
const TOKEN_INPUT = extractToken(process.env.SB_TOKEN || readTokenFile());

if (process.env.OFFLINE !== "1" && !TOKEN_INPUT && (!EMAIL || !PASS)) {
  console.error("Ge antingen en access-token (SB_TOKEN=... eller scripts/.token) eller SB_EMAIL + SB_PASS.");
  console.error("(Eller kör med OFFLINE=1 för att räkna om från scripts/wolf-data.json.)");
  process.exit(1);
}

// --- Auth ---
async function login(): Promise<string> {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Inloggning misslyckades: ${j.error_description || j.msg || r.status}`);
  return j.access_token as string;
}

let TOKEN = "";
function authHeaders() {
  return { apikey: ANON, Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
}

// --- REST helper med paginering ---
async function rest<T = any>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  const out: T[] = [];
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const qs = new URLSearchParams(params);
    qs.set("limit", String(pageSize));
    qs.set("offset", String(offset));
    const r = await fetch(`${SB_URL}/rest/v1/${path}?${qs.toString()}`, { headers: authHeaders() });
    if (!r.ok) throw new Error(`REST ${path} ${r.status}: ${await r.text()}`);
    const rows = (await r.json()) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

// ---------- Hjälpformat ----------
const fmtSEK = (n: number) =>
  new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(Math.round(n)) + " kr";
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)} %`;
const fmtNum = (n: number) => new Intl.NumberFormat("sv-SE").format(n);

type Trade = {
  id: string; competition_id: string; team_id: string; executed_by: string;
  ticker: string; stock_name: string; side: "buy" | "sell" | "short" | "cover";
  shares: number; price_per_share: number; currency: string; exchange_rate: number;
  total_sek: number; realized_pnl_sek: number | null; executed_at: string;
};
type Snapshot = { team_id: string; snapshot_date: string; total_value_sek: number; cash_sek: number; holdings_value_sek: number };

async function main() {
  let comp: any, cteams: any[], tradesRaw: Trade[], snapsRaw: Snapshot[], profiles: any[];

  if (process.env.OFFLINE === "1") {
    // Offline-läge: räkna om från tidigare sparad rådump (ingen inloggning behövs)
    console.error("Offline-läge: läser scripts/wolf-data.json");
    const d = JSON.parse(require("fs").readFileSync(ROOT + "scripts/wolf-data.json", "utf8"));
    comp = d.competition; cteams = d.teams; tradesRaw = d.trades; snapsRaw = d.snapshots; profiles = d.profiles;
    console.error(`→ Tävling: ${comp.name} (${comp.id})`);
  } else {
    if (TOKEN_INPUT) {
      console.error("Använder angiven access-token…");
      TOKEN = TOKEN_INPUT;
    } else {
      console.error("Loggar in…");
      TOKEN = await login();
    }

    console.error("Hämtar tävlingar…");
    const comps = await rest("competitions", { select: "*" });

    const isUuid = /^[0-9a-f-]{36}$/i.test(NAME_MATCH);
    const candidates = isUuid
      ? comps.filter((c: any) => c.id === NAME_MATCH)
      : comps.filter((c: any) => String(c.name).toLowerCase().includes(NAME_MATCH));

    if (candidates.length === 0) {
      console.error(`Hittade ingen tävling som matchar "${NAME_MATCH}". Tillgängliga:`);
      comps.forEach((c: any) => console.error(`  - ${c.name}  (${c.id})`));
      process.exit(1);
    }

    // Vid flera träffar (t.ex. dubbletter med samma namn): välj den med flest trades
    const tradeCount = async (id: string) => {
      const r = await fetch(`${SB_URL}/rest/v1/trades?select=id&competition_id=eq.${id}&limit=1`, {
        headers: { ...authHeaders(), Prefer: "count=exact" },
      });
      return parseInt((r.headers.get("content-range") || "*/0").split("/")[1] || "0", 10);
    };
    comp = candidates[0];
    if (candidates.length > 1) {
      const counts = await Promise.all(candidates.map((c: any) => tradeCount(c.id)));
      let best = 0;
      candidates.forEach((c: any, i: number) => {
        console.error(`  kandidat: ${c.name} (${c.id}) — ${counts[i]} trades`);
        if (counts[i] > best) { best = counts[i]; comp = c; }
      });
    }
    console.error(`→ Vald tävling: ${comp.name} (${comp.id})  ${comp.start_date} – ${comp.end_date}`);

    console.error("Hämtar lag, trades, snapshots, profiler…");
    [cteams, tradesRaw, snapsRaw, profiles] = await Promise.all([
      rest("competition_teams", { select: "*,teams(name)", competition_id: `eq.${comp.id}` }),
      rest<Trade>("trades", { select: "*", competition_id: `eq.${comp.id}`, order: "executed_at.asc" }),
      rest<Snapshot>("portfolio_snapshots", { select: "*", competition_id: `eq.${comp.id}`, order: "snapshot_date.asc" }),
      rest("profiles", { select: "id,full_name,email" }),
    ]);
  }

  const cid = comp.id;
  const initial = Number(comp.initial_balance);

  const trades = tradesRaw.map((t) => ({ ...t, total_sek: Number(t.total_sek), shares: Number(t.shares), price_per_share: Number(t.price_per_share), realized_pnl_sek: t.realized_pnl_sek == null ? null : Number(t.realized_pnl_sek) }));
  // OBS: DB-kolumnen total_value_sek är buggig (matchar ibland inte cash+holdings, ~dubblas).
  // Vi använder den konsistenta summan cash + holdings som "sanning" och sparar råvärdet separat.
  const snaps = snapsRaw.map((s) => {
    const cash = Number(s.cash_sek), hold = Number(s.holdings_value_sek);
    return { ...s, total_value_raw: Number(s.total_value_sek), cash_sek: cash, holdings_value_sek: hold, total_value_sek: cash + hold };
  });

  // Räkna realiserad P&L SJÄLVA per stängande affär (snittkostnad, long & short separat).
  // DB-kolumnen realized_pnl_sek är null på de flesta affärer, så vi skriver över den.
  const longPos: Record<string, { qty: number; avg: number }> = {};
  const shortPos: Record<string, { qty: number; avg: number }> = {};
  for (const t of trades) {
    const key = `${t.team_id}|${t.ticker}`;
    const px = t.shares ? t.total_sek / t.shares : 0; // SEK per aktie (inkl. valuta)
    if (t.side === "buy") {
      const p = (longPos[key] ??= { qty: 0, avg: 0 });
      p.avg = p.qty + t.shares > 0 ? (p.avg * p.qty + px * t.shares) / (p.qty + t.shares) : px;
      p.qty += t.shares;
      t.realized_pnl_sek = null;
    } else if (t.side === "sell") {
      const p = (longPos[key] ??= { qty: 0, avg: 0 });
      t.realized_pnl_sek = p.qty > 0 ? (px - p.avg) * Math.min(t.shares, p.qty) : null;
      p.qty = Math.max(0, p.qty - t.shares);
    } else if (t.side === "short") {
      const p = (shortPos[key] ??= { qty: 0, avg: 0 });
      p.avg = p.qty + t.shares > 0 ? (p.avg * p.qty + px * t.shares) / (p.qty + t.shares) : px;
      p.qty += t.shares;
      t.realized_pnl_sek = null;
    } else if (t.side === "cover") {
      const p = (shortPos[key] ??= { qty: 0, avg: 0 });
      t.realized_pnl_sek = p.qty > 0 ? (p.avg - px) * Math.min(t.shares, p.qty) : null;
      p.qty = Math.max(0, p.qty - t.shares);
    }
  }

  const teamName: Record<string, string> = {};
  for (const ct of cteams as any[]) teamName[ct.team_id] = ct.teams?.name || ct.team_id.slice(0, 8);
  const profName: Record<string, string> = {};
  for (const p of profiles as any[]) profName[p.id] = p.full_name || (p.email || "").split("@")[0] || p.id.slice(0, 8);

  const teamIds = (cteams as any[]).map((c) => c.team_id);

  // ---- Slutvärde per lag: senaste snapshot, annars cash ----
  const latestSnap: Record<string, Snapshot> = {};
  for (const s of snaps) {
    if (!latestSnap[s.team_id] || s.snapshot_date > latestSnap[s.team_id].snapshot_date) latestSnap[s.team_id] = s;
  }
  const finalValue: Record<string, number> = {};
  for (const ct of cteams as any[]) {
    const ls = latestSnap[ct.team_id];
    finalValue[ct.team_id] = ls ? ls.total_value_sek : Number(ct.cash_balance_sek);
  }

  const standings = teamIds
    .map((id) => ({ team_id: id, name: teamName[id], value: finalValue[id], ret: ((finalValue[id] - initial) / initial) * 100 }))
    .sort((a, b) => b.value - a.value)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  // ---- Per-lag aggregat ----
  type TeamAgg = {
    team_id: string; name: string; trades: number; buys: number; sells: number; shorts: number; covers: number;
    volume: number; uniqueTickers: Set<string>; realizedPnl: number; closed: number; wins: number; losses: number;
    best: Trade | null; worst: Trade | null; firstTrade?: string; lastTrade?: string; tickerCount: Record<string, number>;
  };
  const agg: Record<string, TeamAgg> = {};
  for (const id of teamIds)
    agg[id] = { team_id: id, name: teamName[id], trades: 0, buys: 0, sells: 0, shorts: 0, covers: 0, volume: 0, uniqueTickers: new Set(), realizedPnl: 0, closed: 0, wins: 0, losses: 0, best: null, worst: null, tickerCount: {} };

  const tickerCountGlobal: Record<string, { name: string; count: number; volume: number }> = {};
  const tickerPnlGlobal: Record<string, { name: string; pnl: number }> = {};
  const hourHist: number[] = new Array(24).fill(0);

  for (const t of trades) {
    const a = agg[t.team_id];
    if (!a) continue;
    a.trades++;
    a.volume += Math.abs(t.total_sek);
    a.uniqueTickers.add(t.ticker);
    a.tickerCount[t.ticker] = (a.tickerCount[t.ticker] || 0) + 1;
    if (t.side === "buy") a.buys++;
    else if (t.side === "sell") a.sells++;
    else if (t.side === "short") a.shorts++;
    else if (t.side === "cover") a.covers++;
    a.firstTrade = a.firstTrade ?? t.executed_at;
    a.lastTrade = t.executed_at;
    if (t.realized_pnl_sek != null && (t.side === "sell" || t.side === "cover")) {
      a.realizedPnl += t.realized_pnl_sek;
      a.closed++;
      if (t.realized_pnl_sek > 0) a.wins++;
      else if (t.realized_pnl_sek < 0) a.losses++;
      if (!a.best || t.realized_pnl_sek > (a.best.realized_pnl_sek ?? -Infinity)) a.best = t;
      if (!a.worst || t.realized_pnl_sek < (a.worst.realized_pnl_sek ?? Infinity)) a.worst = t;
    }

    // global
    if (!tickerCountGlobal[t.ticker]) tickerCountGlobal[t.ticker] = { name: t.stock_name, count: 0, volume: 0 };
    tickerCountGlobal[t.ticker].count++;
    tickerCountGlobal[t.ticker].volume += Math.abs(t.total_sek);
    if (t.realized_pnl_sek != null) {
      if (!tickerPnlGlobal[t.ticker]) tickerPnlGlobal[t.ticker] = { name: t.stock_name, pnl: 0 };
      tickerPnlGlobal[t.ticker].pnl += t.realized_pnl_sek;
    }
    hourHist[new Date(t.executed_at).getUTCHours()]++;
  }

  // ---- Snapshot-baserat: dagar i ledning, volatilitet, max drawdown, bästa/sämsta dag ----
  const dates = [...new Set(snaps.map((s) => s.snapshot_date))].sort();
  const byDate: Record<string, Record<string, number>> = {};
  for (const s of snaps) (byDate[s.snapshot_date] ??= {})[s.team_id] = s.total_value_sek;

  const daysInLead: Record<string, number> = {};
  for (const d of dates) {
    const entries = Object.entries(byDate[d]);
    if (!entries.length) continue;
    const leader = entries.sort((a, b) => b[1] - a[1])[0][0];
    daysInLead[leader] = (daysInLead[leader] || 0) + 1;
  }

  // per-lag tidsserie för volatilitet / drawdown / bästa dag
  // Filtrera bort skräp-snapshots (värde ≈ 0 innan laget hade data) som annars
  // ger absurda dagsavkastningar (division med ~0).
  const MIN_VAL = initial * 0.2;
  const teamSeries: Record<string, { date: string; v: number }[]> = {};
  for (const s of snaps) if (s.total_value_sek > MIN_VAL) (teamSeries[s.team_id] ??= []).push({ date: s.snapshot_date, v: s.total_value_sek });
  for (const id in teamSeries) teamSeries[id].sort((a, b) => a.date.localeCompare(b.date));

  const risk: Record<string, { vol: number; maxDd: number; bestDay: number; worstDay: number; bestDayDate?: string; worstDayDate?: string }> = {};
  for (const id of teamIds) {
    const ser = teamSeries[id] || [];
    const rets: number[] = [];
    let peak = -Infinity, maxDd = 0, bestDay = 0, worstDay = 0, bestDate = "", worstDate = "";
    for (let i = 0; i < ser.length; i++) {
      if (i > 0 && ser[i - 1].v > 0) {
        const r = (ser[i].v - ser[i - 1].v) / ser[i - 1].v;
        rets.push(r);
        if (r > bestDay) { bestDay = r; bestDate = ser[i].date; }
        if (r < worstDay) { worstDay = r; worstDate = ser[i].date; }
      }
      if (ser[i].v > peak) peak = ser[i].v;
      const dd = peak > 0 ? (ser[i].v - peak) / peak : 0;
      if (dd < maxDd) maxDd = dd;
    }
    const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
    const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1);
    risk[id] = { vol: Math.sqrt(variance) * 100, maxDd: maxDd * 100, bestDay: bestDay * 100, worstDay: worstDay * 100, bestDayDate: bestDate, worstDayDate: worstDate };
  }

  // ---- Snabbaste flip (köp -> sälj av samma ticker, kortaste hålltid) ----
  type Flip = { team: string; ticker: string; name: string; ms: number; pnl: number | null };
  let fastestFlip: Flip | null = null;
  const openLots: Record<string, { time: number }[]> = {}; // key team|ticker FIFO
  for (const t of trades) {
    const key = `${t.team_id}|${t.ticker}`;
    if (t.side === "buy" || t.side === "short") {
      (openLots[key] ??= []).push({ time: new Date(t.executed_at).getTime() });
    } else if (t.side === "sell" || t.side === "cover") {
      const lot = (openLots[key] || []).shift();
      if (lot) {
        const ms = new Date(t.executed_at).getTime() - lot.time;
        if (!fastestFlip || ms < fastestFlip.ms)
          fastestFlip = { team: teamName[t.team_id], ticker: t.ticker, name: t.stock_name, ms, pnl: t.realized_pnl_sek };
      }
    }
  }

  // ---- Globala bästa/sämsta enskilda trade ----
  const closedTrades = trades.filter((t) => t.realized_pnl_sek != null && (t.side === "sell" || t.side === "cover"));
  const bestTrade = closedTrades.reduce<Trade | null>((b, t) => (!b || (t.realized_pnl_sek ?? -Infinity) > (b.realized_pnl_sek ?? -Infinity) ? t : b), null);
  const worstTrade = closedTrades.reduce<Trade | null>((w, t) => (!w || (t.realized_pnl_sek ?? Infinity) < (w.realized_pnl_sek ?? Infinity) ? t : w), null);
  const biggestTrade = trades.reduce<Trade | null>((b, t) => (!b || Math.abs(t.total_sek) > Math.abs(b.total_sek) ? t : b), null);

  const aggArr = teamIds.map((id) => agg[id]).filter((a) => a.trades > 0);
  const argmax = <T,>(arr: T[], f: (x: T) => number) => arr.reduce<T | null>((b, x) => (!b || f(x) > f(b) ? x : b), null);
  const argmin = <T,>(arr: T[], f: (x: T) => number) => arr.reduce<T | null>((b, x) => (!b || f(x) < f(b) ? x : b), null);

  const topStocks = Object.entries(tickerCountGlobal).map(([tk, v]) => ({ ticker: tk, ...v })).sort((a, b) => b.count - a.count);
  const stockPnl = Object.entries(tickerPnlGlobal).map(([tk, v]) => ({ ticker: tk, ...v })).sort((a, b) => b.pnl - a.pnl);

  // =================== RAPPORT ===================
  const L: string[] = [];
  const p = (s = "") => L.push(s);
  const totalTrades = trades.length;
  const totalVolume = trades.reduce((s, t) => s + Math.abs(t.total_sek), 0);
  const winner = standings[0];
  const loser = standings[standings.length - 1];

  p(`# 🐺 ${comp.name} — tävlingsrapport`);
  p();
  p(`**Period:** ${comp.start_date} → ${comp.end_date}  ·  **Startkapital:** ${fmtSEK(initial)}  ·  **Lag:** ${teamIds.length}`);
  p();
  p(`> ${fmtNum(totalTrades)} affärer · ${fmtSEK(totalVolume)} i total omsättning · ${Object.keys(tickerCountGlobal).length} unika aktier`);
  p();

  p(`## 🏆 Slutställning`);
  p();
  p(`| # | Lag | Slutvärde | Avkastning |`);
  p(`|---|-----|-----------|------------|`);
  for (const s of standings) p(`| ${s.rank} | ${s.name} | ${fmtSEK(s.value)} | ${fmtPct(s.ret)} |`);
  p();

  p(`## 🎖️ Roliga utmärkelser`);
  p();
  const awards: [string, string, string][] = []; // emoji, titel, motivering

  awards.push(["🥇", "Wolf of Södergatan (vinnaren)", `**${winner.name}** — ${fmtSEK(winner.value)} (${fmtPct(winner.ret)})`]);
  awards.push(["🪙", "Tröstpriset (sist)", `**${loser.name}** — ${fmtSEK(loser.value)} (${fmtPct(loser.ret)})`]);

  const mostActive = argmax(aggArr, (a) => a.trades);
  if (mostActive) awards.push(["⚡", "Daytradern (flest affärer)", `**${mostActive.name}** — ${fmtNum(mostActive.trades)} affärer`]);
  const leastActive = argmin(aggArr, (a) => a.trades);
  if (leastActive) awards.push(["🦥", "Diamantnävarna (färst affärer)", `**${leastActive.name}** — bara ${fmtNum(leastActive.trades)} affärer`]);

  const biggestVolume = argmax(aggArr, (a) => a.volume);
  if (biggestVolume) awards.push(["💸", "Storspelaren (störst omsättning)", `**${biggestVolume.name}** — ${fmtSEK(biggestVolume.volume)} omsatt`]);

  const mostDiverse = argmax(aggArr, (a) => a.uniqueTickers.size);
  if (mostDiverse) awards.push(["🌈", "Diversifieraren (flest olika aktier)", `**${mostDiverse.name}** — ${mostDiverse.uniqueTickers.size} olika aktier`]);
  const mostConcentrated = argmin(aggArr, (a) => a.uniqueTickers.size);
  if (mostConcentrated) awards.push(["🎯", "All-in (färst olika aktier)", `**${mostConcentrated.name}** — bara ${mostConcentrated.uniqueTickers.size} olika aktier`]);

  const winRateTeams = aggArr.filter((a) => a.closed >= 3);
  const bestWinRate = argmax(winRateTeams, (a) => a.wins / a.closed);
  if (bestWinRate) awards.push(["🎰", "Träffsäkraste (bäst vinstrate)", `**${bestWinRate.name}** — ${((bestWinRate.wins / bestWinRate.closed) * 100).toFixed(0)} % vinnande affärer (${bestWinRate.wins}/${bestWinRate.closed})`]);

  const shortKing = argmax(aggArr, (a) => a.shorts);
  if (shortKing && shortKing.shorts > 0) awards.push(["🐻", "Björnen (flest blankningar)", `**${shortKing.name}** — ${shortKing.shorts} blankningar`]);

  if (bestTrade) awards.push(["🚀", "Bästa enskilda affären", `**${teamName[bestTrade.team_id]}** på ${bestTrade.stock_name} (${bestTrade.ticker}) — ${fmtSEK(bestTrade.realized_pnl_sek ?? 0)}`]);
  if (worstTrade) awards.push(["💀", "Värsta enskilda affären", `**${teamName[worstTrade.team_id]}** på ${worstTrade.stock_name} (${worstTrade.ticker}) — ${fmtSEK(worstTrade.realized_pnl_sek ?? 0)}`]);
  if (biggestTrade) awards.push(["🐘", "Största ordern", `**${teamName[biggestTrade.team_id]}** — ${biggestTrade.side} ${fmtNum(biggestTrade.shares)} ${biggestTrade.ticker} för ${fmtSEK(Math.abs(biggestTrade.total_sek))}`]);

  const leadDaysArr = Object.entries(daysInLead).sort((a, b) => b[1] - a[1]);
  if (leadDaysArr.length) awards.push(["👑", "Mest tid i ledning", `**${teamName[leadDaysArr[0][0]]}** — ledde ${leadDaysArr[0][1]} av ${dates.length} dagar`]);

  const riskArr = teamIds.map((id) => ({ id, ...risk[id] })).filter((r) => isFinite(r.vol) && r.vol > 0);
  const wildest = argmax(riskArr, (r) => r.vol);
  if (wildest) awards.push(["🎢", "Berg-och-dalbanan (högst volatilitet)", `**${teamName[wildest.id]}** — ${wildest.vol.toFixed(1)} % daglig volatilitet`]);
  const steadiest = argmin(riskArr, (r) => r.vol);
  if (steadiest) awards.push(["🧘", "Lugnast i stormen (lägst volatilitet)", `**${teamName[steadiest.id]}** — ${steadiest.vol.toFixed(1)} % daglig volatilitet`]);
  const deepestDd = argmin(riskArr, (r) => r.maxDd);
  if (deepestDd) awards.push(["📉", "Störst ras (max drawdown)", `**${teamName[deepestDd.id]}** — ${deepestDd.maxDd.toFixed(1)} % från topp`]);
  const bestDayTeam = argmax(riskArr, (r) => r.bestDay);
  if (bestDayTeam && bestDayTeam.bestDay > 0) awards.push(["☀️", "Bästa enskilda dagen", `**${teamName[bestDayTeam.id]}** — ${fmtPct(bestDayTeam.bestDay)} den ${bestDayTeam.bestDayDate}`]);
  const worstDayTeam = argmin(riskArr, (r) => r.worstDay);
  if (worstDayTeam && worstDayTeam.worstDay < 0) awards.push(["🌧️", "Värsta enskilda dagen", `**${teamName[worstDayTeam.id]}** — ${fmtPct(worstDayTeam.worstDay)} den ${worstDayTeam.worstDayDate}`]);

  if (fastestFlip && (fastestFlip as Flip).ms < 1000 * 60 * 60 * 24) {
    const f = fastestFlip as Flip;
    const mins = Math.round(f.ms / 60000);
    awards.push(["🤹", "Snabbaste fingret (kortaste innehav)", `**${f.team}** — köpte & sålde ${f.ticker} inom ${mins < 60 ? mins + " min" : (mins / 60).toFixed(1) + " h"}`]);
  }

  // "Slutade tidigt" — lag vars sista affär ligger längst från slutdatum
  const stoppedEarly = argmin(aggArr.filter((a) => a.lastTrade), (a) => new Date(a.lastTrade!).getTime());
  if (stoppedEarly && stoppedEarly.lastTrade) awards.push(["😴", "Tappade sugen först", `**${stoppedEarly.name}** — sista affären redan ${stoppedEarly.lastTrade.slice(0, 10)}`]);

  const nightOwl = hourHist.slice(0, 6).reduce((a, b) => a + b, 0);
  // favorite stock overall
  if (topStocks.length) awards.push(["❤️", "Tävlingens favoritaktie", `**${topStocks[0].name}** (${topStocks[0].ticker}) — handlad ${topStocks[0].count} gånger`]);
  if (stockPnl.length) {
    awards.push(["🏅", "Vinnaraktien (mest realiserad vinst totalt)", `**${stockPnl[0].name}** (${stockPnl[0].ticker}) — ${fmtSEK(stockPnl[0].pnl)}`]);
    const wstock = stockPnl[stockPnl.length - 1];
    awards.push(["🥀", "Förloraraktien (mest realiserad förlust totalt)", `**${wstock.name}** (${wstock.ticker}) — ${fmtSEK(wstock.pnl)}`]);
  }

  for (const [e, title, motiv] of awards) p(`- ${e} **${title}** — ${motiv}`);
  p();

  // Per-lag tabell
  p(`## 📊 Per lag`);
  p();
  p(`| Lag | Affärer | Köp/Sälj/Blank/Täck | Omsättning | Realiserad P&L | Vinstrate | Olika aktier | Favorit |`);
  p(`|-----|--------:|:-------------------:|-----------:|---------------:|:---------:|:------------:|---------|`);
  for (const s of standings) {
    const a = agg[s.team_id];
    if (!a) continue;
    const fav = Object.entries(a.tickerCount).sort((x, y) => y[1] - x[1])[0];
    const wr = a.closed ? `${((a.wins / a.closed) * 100).toFixed(0)} %` : "–";
    p(`| ${a.name} | ${a.trades} | ${a.buys}/${a.sells}/${a.shorts}/${a.covers} | ${fmtSEK(a.volume)} | ${a.closed ? fmtSEK(a.realizedPnl) : "–"} | ${wr} | ${a.uniqueTickers.size} | ${fav ? fav[0] + " ×" + fav[1] : "–"} |`);
  }
  p();

  p(`## 🔥 Mest handlade aktier`);
  p();
  p(`| # | Aktie | Antal affärer | Omsättning |`);
  p(`|---|-------|--------------:|-----------:|`);
  topStocks.slice(0, 10).forEach((s, i) => p(`| ${i + 1} | ${s.name} (${s.ticker}) | ${s.count} | ${fmtSEK(s.volume)} |`));
  p();

  p(`## ℹ️ Metod & förbehåll`);
  p();
  p(`- **Slutställning, omsättning, antal affärer, P&L och aktiestatistik** bygger på \`trades\`-tabellen och är tillförlitliga.`);
  p(`- **Realiserad P&L** är beräknad av oss per stängande affär med snittkostnad (long & short separat) — databasens \`realized_pnl_sek\` saknades på de flesta affärer.`);
  p(`- **Slutvärde** = lagets sista dagliga snapshot (\`cash + holdings\`).`);
  p(`- **Volatilitet, drawdown och bästa/sämsta dag** bygger på de dagliga snapshotsen, som är något inkonsekventa (timing-glapp, enstaka nollvärden). Rätt lag hamnar rätt, men exakta dagsprocent är ungefärliga. Snapshots under ${fmtSEK(MIN_VAL)} har filtrerats bort.`);
  p();
  p(`<sub>Genererad ${new Date().toISOString().slice(0, 16).replace("T", " ")} · ${trades.length} affärer · ${snaps.length} snapshots</sub>`);

  const report = L.join("\n");
  const fs = require("fs");
  fs.writeFileSync(ROOT + "scripts/wolf-report.md", report);
  fs.writeFileSync(
    ROOT + "scripts/wolf-data.json",
    JSON.stringify({ competition: comp, teams: cteams, standings, trades, snapshots: snaps, profiles }, null, 2)
  );

  // =================== HTML-PRESENTATION ===================
  const esc = (s: any) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const md = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const palette = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa", "#fb923c", "#22d3ee"];

  const allDates = [...new Set(Object.values(teamSeries).flat().map((p) => p.date))].sort();
  const chartData = {
    dates: allDates,
    initial,
    race: standings.map((s, i) => {
      const m: Record<string, number> = {};
      (teamSeries[s.team_id] || []).forEach((p) => (m[p.date] = Math.round(p.v)));
      return { name: s.name, color: palette[i % palette.length], data: allDates.map((d) => (d in m ? m[d] : null)) };
    }),
    returns: standings.map((s) => ({ name: s.name, ret: Math.round(s.ret * 10) / 10, color: s.ret >= 0 ? "#22c55e" : "#ef4444" })),
    stocks: topStocks.slice(0, 12).map((s) => ({ label: s.ticker, count: s.count })),
  };

  const medals = ["🥇", "🥈", "🥉"];
  const podiumHtml = [1, 0, 2]
    .map((idx) => {
      const s = standings[idx];
      if (!s) return "";
      const cls = idx === 0 ? "first" : idx === 1 ? "second" : "third";
      const pos = s.ret >= 0;
      return `<div class="podium-col ${cls} reveal">
        <div class="medal">${medals[s.rank - 1]}</div>
        <div class="p-name">${esc(s.name)}</div>
        <div class="p-ret ${pos ? "gain" : "loss"}">${pos ? "+" : ""}${s.ret.toFixed(1)} %</div>
        <div class="p-val">${fmtSEK(s.value)}</div>
        <div class="p-bar"><span>#${s.rank}</span></div>
      </div>`;
    })
    .join("");

  const awardsHtml = awards
    .map(([e, t, m]) => `<div class="award reveal"><div class="ae">${e}</div><div class="ab"><div class="at">${esc(t)}</div><div class="am">${md(m)}</div></div></div>`)
    .join("");

  const rowsHtml = standings
    .map((s) => {
      const a = agg[s.team_id];
      const fav = a ? Object.entries(a.tickerCount).sort((x, y) => y[1] - x[1])[0] : null;
      const wr = a && a.closed ? `${((a.wins / a.closed) * 100).toFixed(0)} %` : "–";
      const pos = s.ret >= 0;
      const pnl = a && a.closed ? a.realizedPnl : null;
      return `<tr>
        <td class="rank">${s.rank}</td>
        <td class="tname">${esc(s.name)}</td>
        <td class="num">${fmtSEK(s.value)}</td>
        <td class="num ${pos ? "gain" : "loss"}">${pos ? "+" : ""}${s.ret.toFixed(1)} %</td>
        <td class="num">${a ? a.trades : 0}</td>
        <td class="num ${pnl == null ? "" : pnl >= 0 ? "gain" : "loss"}">${pnl == null ? "–" : fmtSEK(pnl)}</td>
        <td class="num">${wr}</td>
        <td class="num">${a ? a.uniqueTickers.size : 0}</td>
        <td class="tk">${fav ? esc(fav[0]) + " ×" + fav[1] : "–"}</td>
      </tr>`;
    })
    .join("");

  const winnerName = esc(winner.name);
  const html = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(comp.name)} — tävlingsrapport</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#070b16; --bg2:#0b1120; --card:rgba(255,255,255,.035); --card2:rgba(255,255,255,.06);
    --bd:rgba(255,255,255,.09); --tx:#e6edf6; --mut:#7c8aa3; --teal:#2dd4bf; --gain:#22c55e; --loss:#ef4444;
    --gold:#fbbf24; --silver:#cbd5e1; --bronze:#e07b39;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{background:var(--bg);color:var(--tx);font-family:Inter,system-ui,sans-serif;line-height:1.5;overflow-x:hidden;-webkit-font-smoothing:antialiased}
  .num,.mono{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums}
  .gain{color:var(--gain)} .loss{color:var(--loss)}
  /* background orbs */
  .orb{position:fixed;border-radius:50%;filter:blur(90px);opacity:.5;z-index:0;pointer-events:none}
  .orb.a{width:520px;height:520px;background:#0f766e;top:-160px;right:-120px}
  .orb.b{width:480px;height:480px;background:#1e3a8a;bottom:-180px;left:-140px}
  .orb.c{width:360px;height:360px;background:#7e22ce;top:40%;left:55%;opacity:.28}
  .wrap{position:relative;z-index:1;max-width:1080px;margin:0 auto;padding:0 20px 80px}
  /* hero */
  .hero{text-align:center;padding:90px 0 40px}
  .hero .emoji{font-size:64px;filter:drop-shadow(0 6px 24px rgba(45,212,191,.45));animation:float 5s ease-in-out infinite}
  @keyframes float{50%{transform:translateY(-12px)}}
  .hero h1{font-family:Sora;font-weight:800;font-size:clamp(34px,6vw,60px);line-height:1.05;margin:14px 0 8px;
    background:linear-gradient(120deg,#fff 10%,var(--teal) 55%,#60a5fa 95%);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:-.02em}
  .hero .sub{color:var(--mut);font-size:15px;letter-spacing:.04em}
  .chips{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:30px}
  .chip{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:12px 18px;min-width:120px;backdrop-filter:blur(8px)}
  .chip .v{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:20px;display:block}
  .chip .l{color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-top:3px}
  /* sections */
  section{margin-top:64px}
  .sec-title{font-family:Sora;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.18em;color:var(--teal);margin-bottom:22px;display:flex;align-items:center;gap:10px}
  .sec-title::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--bd),transparent)}
  /* podium */
  .podium{display:grid;grid-template-columns:1fr 1.15fr 1fr;gap:16px;align-items:end}
  .podium-col{background:var(--card);border:1px solid var(--bd);border-radius:18px;padding:22px 14px 0;text-align:center;overflow:hidden;backdrop-filter:blur(8px)}
  .podium-col.first{border-color:rgba(251,191,36,.4);background:linear-gradient(180deg,rgba(251,191,36,.12),var(--card));box-shadow:0 0 50px rgba(251,191,36,.18)}
  .medal{font-size:40px;line-height:1}
  .p-name{font-family:Sora;font-weight:700;margin:10px 0 6px;font-size:16px}
  .p-ret{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:22px}
  .p-val{color:var(--mut);font-family:'JetBrains Mono',monospace;font-size:13px;margin-top:2px}
  .p-bar{margin-top:16px;display:flex;align-items:center;justify-content:center;font-family:Sora;font-weight:800;color:rgba(255,255,255,.85);background:rgba(255,255,255,.05)}
  .first .p-bar{height:96px;background:linear-gradient(180deg,rgba(251,191,36,.35),rgba(251,191,36,.05))}
  .second .p-bar{height:66px} .third .p-bar{height:46px}
  /* awards grid */
  .awards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
  .award{display:flex;gap:14px;align-items:flex-start;background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:16px;transition:transform .25s,border-color .25s,background .25s}
  .award:hover{transform:translateY(-4px);border-color:rgba(45,212,191,.5);background:var(--card2)}
  .ae{font-size:30px;line-height:1;flex-shrink:0}
  .at{font-family:Sora;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut)}
  .am{font-size:15px;margin-top:4px} .am strong{color:var(--tx);font-weight:600}
  /* charts */
  .card{background:var(--card);border:1px solid var(--bd);border-radius:18px;padding:22px;backdrop-filter:blur(8px)}
  .card h3{font-family:Sora;font-weight:700;font-size:15px;margin-bottom:16px}
  .chart-box{position:relative;height:340px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .chart-box.sm{height:300px}
  /* table */
  .tbl-wrap{overflow-x:auto;border:1px solid var(--bd);border-radius:18px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{padding:13px 14px;text-align:left;white-space:nowrap}
  thead th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);font-weight:600;border-bottom:1px solid var(--bd);background:rgba(255,255,255,.02)}
  tbody tr{border-bottom:1px solid rgba(255,255,255,.05)}
  tbody tr:last-child{border-bottom:none}
  tbody tr:hover{background:rgba(45,212,191,.05)}
  td.num{text-align:right;font-family:'JetBrains Mono',monospace}
  td.rank{color:var(--mut);font-family:'JetBrains Mono',monospace;font-weight:700;width:30px}
  td.tname{font-weight:600} td.tk{font-family:'JetBrains Mono',monospace;color:var(--teal);font-size:12px}
  .foot{margin-top:60px;color:var(--mut);font-size:12.5px;line-height:1.7;border-top:1px solid var(--bd);padding-top:24px}
  .foot strong{color:#aebbcf}
  /* reveal */
  .reveal{opacity:0;transform:translateY(22px);transition:opacity .6s ease,transform .6s ease}
  .reveal.in{opacity:1;transform:none}
  @media(max-width:720px){.grid2{grid-template-columns:1fr}.podium{grid-template-columns:1fr;align-items:stretch}.first .p-bar,.second .p-bar,.third .p-bar{height:44px}}
</style>
</head>
<body>
<div class="orb a"></div><div class="orb b"></div><div class="orb c"></div>
<div class="wrap">
  <header class="hero">
    <div class="emoji">🐺</div>
    <h1>${esc(comp.name)}</h1>
    <div class="sub">${comp.start_date} &nbsp;→&nbsp; ${comp.end_date} &nbsp;·&nbsp; Startkapital ${fmtSEK(initial)}</div>
    <div class="chips">
      <div class="chip"><span class="v">${teamIds.length}</span><span class="l">Lag</span></div>
      <div class="chip"><span class="v">${fmtNum(totalTrades)}</span><span class="l">Affärer</span></div>
      <div class="chip"><span class="v">${fmtSEK(totalVolume)}</span><span class="l">Omsättning</span></div>
      <div class="chip"><span class="v">${Object.keys(tickerCountGlobal).length}</span><span class="l">Unika aktier</span></div>
      <div class="chip"><span class="v">${dates.length}</span><span class="l">Handelsdagar</span></div>
    </div>
  </header>

  <section>
    <div class="sec-title">🏆 Pallen</div>
    <div class="podium">${podiumHtml}</div>
  </section>

  <section>
    <div class="sec-title">📈 Loppet — portföljvärde över tid</div>
    <div class="card reveal"><div class="chart-box"><canvas id="raceChart"></canvas></div></div>
  </section>

  <section>
    <div class="sec-title">🎖️ Roliga utmärkelser</div>
    <div class="awards">${awardsHtml}</div>
  </section>

  <section>
    <div class="grid2">
      <div class="card reveal"><h3>Avkastning per lag</h3><div class="chart-box sm"><canvas id="returnsChart"></canvas></div></div>
      <div class="card reveal"><h3>Mest handlade aktier</h3><div class="chart-box sm"><canvas id="stocksChart"></canvas></div></div>
    </div>
  </section>

  <section>
    <div class="sec-title">📊 Alla lag</div>
    <div class="tbl-wrap reveal">
      <table>
        <thead><tr><th>#</th><th>Lag</th><th style="text-align:right">Slutvärde</th><th style="text-align:right">Avkastning</th><th style="text-align:right">Affärer</th><th style="text-align:right">Real. P&amp;L</th><th style="text-align:right">Träff%</th><th style="text-align:right">Aktier</th><th>Favorit</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  </section>

  <div class="foot">
    <strong>Metod &amp; förbehåll.</strong> Slutställning, omsättning, antal affärer och aktiestatistik kommer från <code>trades</code>-tabellen och är tillförlitliga.
    Realiserad P&amp;L är beräknad per stängande affär med snittkostnad (long &amp; short separat). Slutvärde = sista dagliga snapshot (cash + holdings).
    Volatilitet, drawdown och bästa/sämsta dag bygger på dagliga snapshots som är något inkonsekventa — rätt lag hamnar rätt, men exakta dagsprocent är ungefärliga.
    <br><br>Genererad ${new Date().toISOString().slice(0, 16).replace("T", " ")} · ${trades.length} affärer · ${snaps.length} snapshots.
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.4/dist/confetti.browser.min.js"></script>
<script>const CHART = ${JSON.stringify(chartData)};</script>
<script>
(function(){
  Chart.defaults.font.family = 'Inter';
  Chart.defaults.color = '#7c8aa3';
  var grid = 'rgba(148,163,184,0.08)';
  new Chart(document.getElementById('raceChart'), {
    type:'line',
    data:{ labels: CHART.dates, datasets: CHART.race.map(function(s){ return {
      label:s.name, data:s.data, borderColor:s.color, backgroundColor:s.color,
      borderWidth:2.5, pointRadius:0, pointHoverRadius:4, tension:0.25, spanGaps:true }; }) },
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{ legend:{labels:{color:'#cbd5e1',usePointStyle:true,boxWidth:8,padding:14}},
        tooltip:{ callbacks:{ label:function(c){ return c.dataset.label+': '+new Intl.NumberFormat('sv-SE').format(c.parsed.y)+' kr'; } } } },
      scales:{ x:{ ticks:{maxTicksLimit:9,callback:function(v){return CHART.dates[v].slice(5);}}, grid:{color:grid} },
        y:{ ticks:{callback:function(v){return Math.round(v/1000)+'k';}}, grid:{color:grid} } } }
  });
  new Chart(document.getElementById('returnsChart'), {
    type:'bar',
    data:{ labels: CHART.returns.map(function(r){return r.name;}),
      datasets:[{ data: CHART.returns.map(function(r){return r.ret;}), backgroundColor: CHART.returns.map(function(r){return r.color;}), borderRadius:6 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:function(c){return (c.parsed.x>=0?'+':'')+c.parsed.x+' %';}}}},
      scales:{ x:{ticks:{callback:function(v){return v+'%';}},grid:{color:grid}}, y:{ticks:{color:'#cbd5e1'},grid:{display:false}} } }
  });
  new Chart(document.getElementById('stocksChart'), {
    type:'bar',
    data:{ labels: CHART.stocks.map(function(s){return s.label;}),
      datasets:[{ data: CHART.stocks.map(function(s){return s.count;}), backgroundColor:'#2dd4bf', borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ x:{ticks:{maxRotation:60,minRotation:45},grid:{display:false}}, y:{ticks:{precision:0},grid:{color:grid}} } }
  });
  var obs = new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); obs.unobserve(e.target);} }); },{threshold:0.12});
  document.querySelectorAll('.reveal').forEach(function(el){obs.observe(el);});
  if(window.confetti){ setTimeout(function(){ confetti({particleCount:150,spread:80,startVelocity:42,origin:{y:0.3},colors:['#fbbf24','#2dd4bf','#60a5fa','#f472b6']}); },400); }
})();
</script>
</body>
</html>`;
  fs.writeFileSync(ROOT + "scripts/wolf-report.html", html);

  // =================== EMBED-VARIANT (no-JS, inline SVG, inga externa anrop) ===================
  // Linje-graf "Loppet"
  const raceSvg = (() => {
    const W = 920, H = 380, l = 56, r = 16, tp = 14, b = 46, pw = W - l - r, ph = H - tp - b;
    const n = allDates.length;
    const vals: number[] = []; chartData.race.forEach((s) => s.data.forEach((v) => { if (v != null) vals.push(v as number); })); vals.push(initial);
    let ymin = Math.min(...vals), ymax = Math.max(...vals); const padv = (ymax - ymin) * 0.06 || 1; ymin -= padv; ymax += padv;
    const X = (i: number) => l + (n <= 1 ? 0 : (i / (n - 1)) * pw);
    const Y = (v: number) => tp + (1 - (v - ymin) / (ymax - ymin)) * ph;
    let g = "";
    for (let k = 0; k <= 4; k++) { const v = ymin + ((ymax - ymin) * k) / 4; const yy = Y(v).toFixed(1); g += `<line x1="${l}" y1="${yy}" x2="${W - r}" y2="${yy}" stroke="rgba(148,163,184,.12)"/><text x="${l - 8}" y="${(+yy + 3).toFixed(1)}" text-anchor="end" fill="#7c8aa3" font-size="11">${Math.round(v / 1000)}k</text>`; }
    const step = Math.max(1, Math.ceil(n / 8)); let xl = "";
    for (let i = 0; i < n; i += step) { const xx = X(i).toFixed(1); xl += `<text x="${xx}" y="${H - b + 20}" text-anchor="middle" fill="#7c8aa3" font-size="11">${allDates[i].slice(5)}</text>`; }
    let initLine = ""; if (initial >= ymin && initial <= ymax) { const yy = Y(initial).toFixed(1); initLine = `<line x1="${l}" y1="${yy}" x2="${W - r}" y2="${yy}" stroke="#94a3b8" stroke-dasharray="4 4" stroke-width="1" opacity=".5"/>`; }
    let lines = ""; chartData.race.forEach((s) => { const pts = s.data.map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Y(v as number).toFixed(1)}`)).filter(Boolean).join(" "); if (pts) lines += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`; });
    return `<svg class="svgchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Portföljvärde över tid">${g}${initLine}<line x1="${l}" y1="${tp}" x2="${l}" y2="${H - b}" stroke="rgba(148,163,184,.2)"/><line x1="${l}" y1="${H - b}" x2="${W - r}" y2="${H - b}" stroke="rgba(148,163,184,.2)"/>${xl}${lines}</svg>`;
  })();
  const raceLegend = chartData.race.map((s) => `<span class="lg"><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("");

  // Avkastning per lag (liggande staplar)
  const returnsSvg = (() => {
    const teams = chartData.returns; const rowH = 34, top = 8, l = 150, r = 56, W = 920, H = teams.length * rowH + top + 8, pw = W - l - r;
    const rmin = Math.min(0, ...teams.map((t) => t.ret)), rmax = Math.max(0, ...teams.map((t) => t.ret)); const span = rmax - rmin || 1;
    const X = (v: number) => l + ((v - rmin) / span) * pw; const zero = X(0);
    let body = `<line x1="${zero.toFixed(1)}" y1="${top}" x2="${zero.toFixed(1)}" y2="${H - 8}" stroke="rgba(148,163,184,.25)"/>`;
    teams.forEach((tm, i) => {
      const yy = top + i * rowH + 6; const bx = Math.min(zero, X(tm.ret)), bw = Math.abs(X(tm.ret) - zero);
      body += `<text x="${l - 10}" y="${yy + 12}" text-anchor="end" fill="#cbd5e1" font-size="12">${esc(tm.name)}</text>`;
      body += `<rect x="${bx.toFixed(1)}" y="${yy}" width="${Math.max(bw, 2).toFixed(1)}" height="16" rx="4" fill="${tm.color}"/>`;
      const tx = tm.ret >= 0 ? X(tm.ret) + 6 : X(tm.ret) - 6; const anc = tm.ret >= 0 ? "start" : "end";
      body += `<text x="${tx.toFixed(1)}" y="${yy + 12}" text-anchor="${anc}" fill="${tm.color}" font-size="11" font-weight="600">${tm.ret >= 0 ? "+" : ""}${tm.ret}%</text>`;
    });
    return `<svg class="svgchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Avkastning per lag">${body}</svg>`;
  })();

  // Mest handlade aktier (stående staplar)
  const stocksSvg = (() => {
    const data = chartData.stocks; const W = 920, H = 300, l = 34, r = 10, tp = 10, b = 74, pw = W - l - r, ph = H - tp - b; const n = data.length || 1;
    const maxC = Math.max(...data.map((d) => d.count), 1); const bw = (pw / n) * 0.62;
    let g = ""; for (let k = 0; k <= 4; k++) { const v = (maxC * k) / 4; const yy = (tp + (1 - k / 4) * ph).toFixed(1); g += `<line x1="${l}" y1="${yy}" x2="${W - r}" y2="${yy}" stroke="rgba(148,163,184,.12)"/><text x="${l - 6}" y="${(+yy + 3).toFixed(1)}" text-anchor="end" fill="#7c8aa3" font-size="10">${Math.round(v)}</text>`; }
    let bars = ""; data.forEach((d, i) => { const cx = l + (i + 0.5) * (pw / n); const h = (d.count / maxC) * ph; const y = tp + ph - h; bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="#2dd4bf"/><text x="${cx.toFixed(1)}" y="${H - b + 14}" fill="#7c8aa3" font-size="10" text-anchor="end" transform="rotate(-45 ${cx.toFixed(1)} ${H - b + 14})">${esc(d.label)}</text>`; });
    return `<svg class="svgchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mest handlade aktier">${g}${bars}</svg>`;
  })();

  const podiumEmbed = podiumHtml.replace(/ reveal/g, "");
  const awardsEmbed = awardsHtml.replace(/ reveal/g, "");

  const embed = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(comp.name)} — tävlingsrapport</title>
<style>
  :root{--bg:#070b16;--card:rgba(255,255,255,.035);--card2:rgba(255,255,255,.06);--bd:rgba(255,255,255,.09);--tx:#e6edf6;--mut:#7c8aa3;--teal:#2dd4bf;--gain:#22c55e;--loss:#ef4444;
    --disp:"Segoe UI Semibold","Segoe UI",system-ui,-apple-system,Roboto,sans-serif;--body:"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;--mono:ui-monospace,"Cascadia Mono","Segoe UI Mono",Menlo,Consolas,monospace;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--tx);font-family:var(--body);line-height:1.5;-webkit-font-smoothing:antialiased}
  .num{font-family:var(--mono);font-variant-numeric:tabular-nums}
  .gain{color:var(--gain)}.loss{color:var(--loss)}
  .orb{position:fixed;border-radius:50%;filter:blur(90px);opacity:.45;z-index:0;pointer-events:none}
  .orb.a{width:480px;height:480px;background:#0f766e;top:-150px;right:-110px}
  .orb.b{width:440px;height:440px;background:#1e3a8a;bottom:-160px;left:-130px}
  .wrap{position:relative;z-index:1;max-width:1080px;margin:0 auto;padding:0 20px 60px}
  .hero{text-align:center;padding:54px 0 30px}
  .hero .emoji{font-size:58px}
  .hero h1{font-family:var(--disp);font-weight:700;font-size:clamp(30px,5.5vw,54px);line-height:1.05;margin:12px 0 8px;background:linear-gradient(120deg,#fff 10%,var(--teal) 55%,#60a5fa 95%);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:-.02em}
  .hero .sub{color:var(--mut);font-size:14px}
  .chips{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:26px}
  .chip{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:11px 18px;min-width:118px}
  .chip .v{font-family:var(--mono);font-weight:700;font-size:20px;display:block}
  .chip .l{color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-top:3px}
  section{margin-top:52px}
  .sec-title{font-family:var(--disp);font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.18em;color:var(--teal);margin-bottom:20px;display:flex;align-items:center;gap:10px}
  .sec-title::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--bd),transparent)}
  .podium{display:grid;grid-template-columns:1fr 1.15fr 1fr;gap:16px;align-items:end}
  .podium-col{background:var(--card);border:1px solid var(--bd);border-radius:18px;padding:22px 14px 0;text-align:center;overflow:hidden}
  .podium-col.first{border-color:rgba(251,191,36,.4);background:linear-gradient(180deg,rgba(251,191,36,.12),var(--card));box-shadow:0 0 50px rgba(251,191,36,.18)}
  .medal{font-size:38px;line-height:1}
  .p-name{font-family:var(--disp);font-weight:700;margin:10px 0 6px;font-size:16px}
  .p-ret{font-family:var(--mono);font-weight:700;font-size:22px}
  .p-val{color:var(--mut);font-family:var(--mono);font-size:13px;margin-top:2px}
  .p-bar{margin-top:16px;display:flex;align-items:center;justify-content:center;font-family:var(--disp);font-weight:800;color:rgba(255,255,255,.85);background:rgba(255,255,255,.05)}
  .first .p-bar{height:92px;background:linear-gradient(180deg,rgba(251,191,36,.35),rgba(251,191,36,.05))}
  .second .p-bar{height:64px}.third .p-bar{height:44px}
  .awards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
  .award{display:flex;gap:14px;align-items:flex-start;background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:16px}
  .ae{font-size:30px;line-height:1;flex-shrink:0}
  .at{font-family:var(--disp);font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut)}
  .am{font-size:15px;margin-top:4px}.am strong{color:var(--tx);font-weight:600}
  .card{background:var(--card);border:1px solid var(--bd);border-radius:18px;padding:22px}
  .card h3{font-family:var(--disp);font-weight:700;font-size:15px;margin-bottom:14px}
  .svgchart{width:100%;height:auto;display:block}
  .legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:14px;justify-content:center}
  .lg{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#cbd5e1}
  .lg i{width:10px;height:10px;border-radius:3px;display:inline-block}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .tbl-wrap{overflow-x:auto;border:1px solid var(--bd);border-radius:18px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{padding:13px 14px;text-align:left;white-space:nowrap}
  thead th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);font-weight:600;border-bottom:1px solid var(--bd);background:rgba(255,255,255,.02)}
  tbody tr{border-bottom:1px solid rgba(255,255,255,.05)}tbody tr:last-child{border-bottom:none}
  td.num{text-align:right;font-family:var(--mono)}
  td.rank{color:var(--mut);font-family:var(--mono);font-weight:700;width:30px}
  td.tname{font-weight:600}td.tk{font-family:var(--mono);color:var(--teal);font-size:12px}
  .foot{margin-top:54px;color:var(--mut);font-size:12.5px;line-height:1.7;border-top:1px solid var(--bd);padding-top:22px}
  .foot strong{color:#aebbcf}
  @media(max-width:720px){.grid2{grid-template-columns:1fr}.podium{grid-template-columns:1fr;align-items:stretch}.first .p-bar,.second .p-bar,.third .p-bar{height:42px}}
</style>
</head>
<body>
<div class="orb a"></div><div class="orb b"></div>
<div class="wrap">
  <header class="hero">
    <div class="emoji">🐺</div>
    <h1>${esc(comp.name)}</h1>
    <div class="sub">${comp.start_date} &nbsp;→&nbsp; ${comp.end_date} &nbsp;·&nbsp; Startkapital ${fmtSEK(initial)}</div>
    <div class="chips">
      <div class="chip"><span class="v">${teamIds.length}</span><span class="l">Lag</span></div>
      <div class="chip"><span class="v">${fmtNum(totalTrades)}</span><span class="l">Affärer</span></div>
      <div class="chip"><span class="v">${fmtSEK(totalVolume)}</span><span class="l">Omsättning</span></div>
      <div class="chip"><span class="v">${Object.keys(tickerCountGlobal).length}</span><span class="l">Unika aktier</span></div>
      <div class="chip"><span class="v">${dates.length}</span><span class="l">Handelsdagar</span></div>
    </div>
  </header>
  <section><div class="sec-title">🏆 Pallen</div><div class="podium">${podiumEmbed}</div></section>
  <section><div class="sec-title">📈 Loppet — portföljvärde över tid</div><div class="card">${raceSvg}<div class="legend">${raceLegend}</div></div></section>
  <section><div class="sec-title">🎖️ Roliga utmärkelser</div><div class="awards">${awardsEmbed}</div></section>
  <section><div class="grid2">
    <div class="card"><h3>Avkastning per lag</h3>${returnsSvg}</div>
    <div class="card"><h3>Mest handlade aktier</h3>${stocksSvg}</div>
  </div></section>
  <section><div class="sec-title">📊 Alla lag</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>#</th><th>Lag</th><th style="text-align:right">Slutvärde</th><th style="text-align:right">Avkastning</th><th style="text-align:right">Affärer</th><th style="text-align:right">Real. P&amp;L</th><th style="text-align:right">Träff%</th><th style="text-align:right">Aktier</th><th>Favorit</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table></div>
  </section>
  <div class="foot"><strong>Metod &amp; förbehåll.</strong> Slutställning, omsättning, antal affärer och aktiestatistik kommer från handelsdatan och är tillförlitliga. Realiserad P&amp;L är beräknad per stängande affär med snittkostnad. Slutvärde = sista dagliga snapshot (cash + holdings). Volatilitet, drawdown och bästa/sämsta dag bygger på dagliga snapshots som är något inkonsekventa — rätt lag hamnar rätt, men exakta dagsprocent är ungefärliga.<br><br>Genererad ${new Date().toISOString().slice(0, 16).replace("T", " ")} · ${trades.length} affärer · ${snaps.length} snapshots.</div>
</div>
</body>
</html>`;
  fs.writeFileSync(ROOT + "scripts/wolf-report-embed.html", embed);

  // Publik, inloggningsfri sida på StockArenas egen webbplats: public/ serveras som statiska filer.
  const slug = comp.name
    .toLowerCase()
    .replace(/[àáâãä]/g, "a").replace(/å/g, "a").replace(/ö/g, "o").replace(/ø/g, "o").replace(/[èéêë]/g, "e").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // Sajten kör JS utan problem → publicera den INTERAKTIVA versionen där (embed-varianten är till SharePoint).
  fs.mkdirSync(ROOT + "public/resultat", { recursive: true });
  fs.writeFileSync(ROOT + `public/resultat/${slug}.html`, html);

  console.error(`\nKlart!`);
  console.error(`  Publik sida (deploy):  public/resultat/${slug}.html   →   https://<din-domän>/resultat/${slug}.html`);
  console.error(`  Interaktiv:            scripts/wolf-report.html`);
  console.error(`  Embed (no-JS):         scripts/wolf-report-embed.html`);
  console.error(`  MD / JSON:             scripts/wolf-report.md · scripts/wolf-data.json\n`);
  console.log(report);
}

main().catch((e) => {
  console.error("FEL:", e.message);
  process.exit(1);
});
