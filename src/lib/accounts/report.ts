import "server-only";
import { quoteMinOut, uiMultipliers } from "../chain";
import { txUrl } from "../config";
import { db } from "../db";
import { STOCKS, isTicker, type Ticker } from "../stocks";
import { uploadVoice, voiceProblem } from "../voice";
import { AccountError } from "./errors";
import type { Kid } from "./kids";

const DAY_MS = 24 * 3600_000;

/** How a buy has done since: the same USDC buys fewer tokens now if the price went up. Live Aerodrome quote. */
async function changeSince(ticker: Ticker, usdcMicro: bigint, tokensRaw: bigint) {
  try {
    const { quoted } = await quoteMinOut(ticker, usdcMicro);
    if (quoted === 0n) return null;
    return Math.round((Number(tokensRaw) / Number(quoted) - 1) * 10_000) / 100;
  } catch {
    return null;
  }
}

/**
 * Everything that happened for this kid overnight (the last 24 hours), straight from what the night shift,
 * the parent and relatives did on Base. Dividends appear only when a token's multiplier really rose.
 */
export async function morningReport(kid: Kid, holdings: { stocks: { ticker: Ticker; raw: string }[] } | null) {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const [gifts, pitches, allowances, dividends, thanks, siblings] = await Promise.all([
    db().from("gifts").select().eq("kid_id", kid.id).in("kind", ["gift", "group_settled"]).gte("created_at", since).order("created_at", { ascending: false }),
    db().from("pitches").select().eq("kid_id", kid.id).eq("status", "confirmed").gte("decided_at", since),
    db().from("allowance_runs").select().eq("kid_id", kid.id).eq("status", "confirmed").gte("created_at", since),
    db().from("dividend_events").select().gte("seen_at", since),
    db().from("thank_yous").select("gift_id").eq("kid_id", kid.id),
    db().from("kids").select("id, nickname, avatar").eq("parent_id", kid.parent_id),
  ]);
  const thanked = new Set((thanks.data ?? []).map((t) => t.gift_id));
  const held = new Set((holdings?.stocks ?? []).filter((s) => s.raw !== "0").map((s) => STOCKS[s.ticker].token.toLowerCase()));

  // Scorecard: the last few buys (pitches and gifts), each compared with a live quote.
  const { data: recentBuys } = await db().from("pitches").select("id, ticker, usdc_micro, match_micro, tokens_raw").eq("kid_id", kid.id).eq("status", "confirmed").order("decided_at", { ascending: false }).limit(4);
  const scores = await Promise.all(
    (recentBuys ?? []).filter((p) => isTicker(p.ticker) && p.tokens_raw).map(async (p) => ({
      pitchId: p.id,
      ticker: p.ticker as Ticker,
      changePct: await changeSince(p.ticker, BigInt(p.usdc_micro) + BigInt(p.match_micro), BigInt(p.tokens_raw)),
    })),
  );

  // Family leaderboard: learning, never returns.
  const sibIds = (siblings.data ?? []).map((s) => s.id);
  const [allPitches, allThanks] = await Promise.all([
    sibIds.length ? db().from("pitches").select("kid_id, status").in("kid_id", sibIds) : Promise.resolve({ data: [] }),
    sibIds.length ? db().from("thank_yous").select("kid_id").in("kid_id", sibIds) : Promise.resolve({ data: [] }),
  ]);
  const leaderboard = (siblings.data ?? [])
    .map((s) => {
      const mine = (allPitches.data ?? []).filter((p) => p.kid_id === s.id);
      const pitchesMade = mine.filter((p) => p.status !== "failed").length;
      const approvals = mine.filter((p) => p.status === "confirmed").length;
      const thankYous = (allThanks.data ?? []).filter((t) => t.kid_id === s.id).length;
      return { nickname: s.nickname, avatar: s.avatar, me: s.id === kid.id, pitchesMade, approvals, thankYous, points: pitchesMade + approvals * 2 + thankYous };
    })
    .sort((a, b) => b.points - a.points);

  return {
    gifts: (gifts.data ?? []).map((g) => ({
      id: g.id as number,
      kind: g.kind as string,
      gifterName: g.gifter_name as string | null,
      occasion: g.occasion as string | null,
      message: g.message as string | null,
      ticker: g.ticker as Ticker | null,
      usdcMicro: Number(g.usdc_micro),
      tokensRaw: g.tokens_raw as string | null,
      txUrl: txUrl(g.tx_hash),
      thanked: thanked.has(g.id),
    })),
    approved: (pitches.data ?? []).map((p) => ({ id: p.id, ticker: p.ticker as Ticker, usdcMicro: Number(p.usdc_micro), matchPct: p.match_pct, matchMicro: Number(p.match_micro), txUrl: p.tx_hash ? txUrl(p.tx_hash) : null })),
    allowances: (allowances.data ?? []).map((a) => ({ usdcMicro: Number(a.usdc_micro), txUrl: a.tx_hash ? txUrl(a.tx_hash) : null })),
    dividends: (dividends.data ?? [])
      .filter((d) => held.has(String(d.token).toLowerCase()))
      .map((d) => ({ ticker: (Object.keys(STOCKS) as Ticker[]).find((t) => STOCKS[t].token.toLowerCase() === String(d.token).toLowerCase())! })),
    scores,
    leaderboard,
  };
}

/** A kid thanks whoever sent a gift: text and/or a voice note up to 30 seconds. The relative sees it on their gift link. */
export async function sendThankYou(kid: Kid, giftId: unknown, text: unknown, voice?: Blob) {
  const id = Number(giftId);
  const { data: gift } = await db().from("gifts").select("id, kid_id").eq("id", id).maybeSingle();
  if (!gift || gift.kid_id !== kid.id) throw new AccountError("That gift isn't yours.", 404);
  const { count } = await db().from("thank_yous").select("id", { count: "exact", head: true }).eq("gift_id", id);
  if ((count ?? 0) > 0) throw new AccountError("You already said thank you for this one.");
  const message = typeof text === "string" ? text.trim().slice(0, 280) : "";
  if (!message && !voice) throw new AccountError("Write a short thank-you or record a voice note.");
  let voicePath: string | null = null;
  if (voice) {
    const problem = voiceProblem(voice);
    if (problem) throw new AccountError(problem);
    voicePath = await uploadVoice(`real/${kid.id}/${id}`, voice);
  }
  const { error } = await db().from("thank_yous").insert({ gift_id: id, kid_id: kid.id, message: message || null, voice_path: voicePath });
  if (error) throw error;
}

/** Night shift: a rise in a stock token's uiMultiplier means a real dividend was paid. Record it once. */
export async function recordDividends() {
  const now = await uiMultipliers();
  const { data: seen } = await db().from("token_multipliers").select();
  const last = new Map((seen ?? []).map((r) => [String(r.token).toLowerCase(), BigInt(r.multiplier)]));
  const events: string[] = [];
  for (const t of Object.keys(now) as Ticker[]) {
    const token = STOCKS[t].token.toLowerCase();
    const m = BigInt(now[t]);
    const prev = last.get(token);
    if (prev !== undefined && m > prev) {
      await db().from("dividend_events").insert({ token, old_multiplier: prev.toString(), new_multiplier: m.toString() });
      events.push(t);
    }
    await db().from("token_multipliers").upsert({ token, multiplier: m.toString(), updated_at: new Date().toISOString() });
  }
  return events;
}
