import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { keccak256, stringToHex, toHex, type Hash } from "viem";
import { config, txUrl } from "./config";
import { db, type DemoEvent, type DemoSession } from "./db";
import {
  cancelAndRefundTx,
  contributeTx,
  demoFunds,
  giftFromRelayer,
  graduateTx,
  kidHoldings,
  openGroupGiftTx,
  pitchBuy,
  quoteMinOut,
  relayerAddress,
  releaseAllowance,
  setAndReleaseAllowance,
  settleGroupGiftTx,
  uiMultipliers,
  type Holdings,
} from "./chain";
import { STOCKS, type Ticker } from "./stocks";

export class DemoError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const SPEND_KINDS = ["pitch", "gift", "contribution"] as const;
const LIVE_STATUSES = ["queued", "sending", "confirmed"] as const;

// ---------------------------------------------------------------- time (Lagos is UTC+1, no DST)

const LAGOS_OFFSET_H = 1;
function lagosAt(dayOffset: number, hour: number, minute: number) {
  const now = new Date();
  const lagosNow = new Date(now.getTime() + LAGOS_OFFSET_H * 3600_000);
  return new Date(
    Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), lagosNow.getUTCDate() + dayOffset, hour - LAGOS_OFFSET_H, minute),
  );
}

export const ipHashOf = (ip: string) => createHash("sha256").update(`allowance-demo:${ip}`).digest("hex").slice(0, 32);

// ---------------------------------------------------------------- budget

async function spentSince(since: Date, sessionId?: string) {
  let q = db()
    .from("demo_events")
    .select("usdc_micro, match_micro")
    .in("kind", [...SPEND_KINDS])
    .in("status", [...LIVE_STATUSES])
    .gte("created_at", since.toISOString());
  if (sessionId) q = q.eq("session_id", sessionId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).reduce((s, r) => s + BigInt(r.usdc_micro) + BigInt(r.match_micro ?? 0), 0n);
}

const startOfUtcDay = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

/** True when a new session can afford its full night shift (pitch + gift + 2 allowances). */
async function budgetAvailable() {
  const d = config.demo;
  const perSession = d.pitchMicro * 2n + d.giftMicro; // pitch + up to a 100% match + gift
  const [today, funds] = await Promise.all([spentSince(startOfUtcDay()), demoFunds()]);
  return (
    today + perSession <= d.dailyCapMicro &&
    funds.pool >= d.allowanceMicro * 2n + d.pitchMicro &&
    funds.relayerUsdc >= d.giftMicro
  );
}

async function assertCanSpend(session: DemoSession, amount: bigint) {
  const d = config.demo;
  const [mine, today] = await Promise.all([spentSince(new Date(session.created_at), session.id), spentSince(startOfUtcDay())]);
  if (mine + amount > d.sessionCapMicro) throw new DemoError("This demo session has used its tiny budget. Tap Reset demo to start a fresh one.");
  if (today + amount > d.dailyCapMicro) throw new DemoError("Today's demo budget is used up. You can still watch a replay of real transactions.", 429);
}

// ---------------------------------------------------------------- sessions

export async function startSession(
  ipHash: string,
): Promise<{ session: DemoSession | null; replay: boolean; finish?: () => Promise<void> }> {
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db().from("demo_sessions").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", hourAgo);
  if ((count ?? 0) >= config.demo.maxSessionsPerIpPerHour) {
    throw new DemoError("You've started a lot of demos this hour. Please try again a little later.", 429);
  }
  if (!(await budgetAvailable())) return { session: null, replay: true };

  const id = randomUUID();
  const kidId = keccak256(toHex(`allowance-demo-kid:${id}`)); // anonymous on-chain id, never a name
  // Remember each stock's dividend multiplier at bedtime, so the Morning Report can show a real dividend if one is paid.
  const multipliers = await uiMultipliers().catch(() => null);
  const { data: session, error } = await db()
    .from("demo_sessions")
    .insert({ id, kid_id: kidId, virtual_now: lagosAt(0, 21, 30).toISOString(), ip_hash: ipHash, multipliers })
    .select()
    .single();
  if (error) throw error;

  // Tobi starts with last week's allowance so there is something to pitch with (real transactions).
  const { data: ev } = await db()
    .from("demo_events")
    .insert({ session_id: id, kind: "allowance", status: "sending", usdc_micro: Number(config.demo.allowanceMicro) })
    .select()
    .single();
  // Sent after the response so the demo opens instantly; the UI polls until it confirms.
  const finish = async () => {
    try {
      const { hash } = await setAndReleaseAllowance(kidId);
      await db().from("demo_events").update({ status: "confirmed", tx_hash: hash, executed_at: new Date().toISOString() }).eq("id", ev!.id);
    } catch (err) {
      await db().from("demo_events").update({ status: "failed", error: String(err).slice(0, 300) }).eq("id", ev!.id);
    }
  };
  return { session: session as DemoSession, replay: false, finish };
}

export async function getSession(id: string | undefined) {
  if (!id) return null;
  const { data } = await db().from("demo_sessions").select().eq("id", id).maybeSingle();
  return (data as DemoSession) ?? null;
}

async function events(sessionId: string) {
  const { data, error } = await db().from("demo_events").select().eq("session_id", sessionId).order("id");
  if (error) throw error;
  return (data ?? []) as DemoEvent[];
}

export type Score = { eventId: number; ticker: Ticker; changePct: number };
export type Dividend = { ticker: Ticker; extraShares: number };

export type DemoState = {
  session: { id: string; virtualNow: string; morning: boolean };
  events: (DemoEvent & { txUrl: string | null; voiceUrl: string | null })[];
  holdings: Holdings | null;
  /** How each confirmed buy has done since (same USDC amount quoted again now). Filled in the morning. */
  scores: Score[];
  /** Real dividends only: a stock whose uiMultiplier rose since bedtime, for stocks Tobi holds. */
  dividends: Dividend[];
};

/** Change since purchase: the same USDC buys fewer tokens now if the price went up. */
async function scoresFor(evs: DemoEvent[]): Promise<Score[]> {
  const bought = evs.filter(
    (e) => (e.kind === "pitch" || e.kind === "gift" || e.kind === "group_gift") && e.status === "confirmed" && e.tokens_raw && e.ticker,
  );
  const out = await Promise.all(
    bought.map(async (e) => {
      try {
        const paid = BigInt(e.usdc_micro) + BigInt(e.match_micro ?? 0);
        const { quoted } = await quoteMinOut(e.ticker as Ticker, paid);
        if (quoted === 0n) return null;
        const changePct = (Number(BigInt(e.tokens_raw!)) / Number(quoted) - 1) * 100;
        return { eventId: e.id, ticker: e.ticker as Ticker, changePct: Math.round(changePct * 100) / 100 };
      } catch {
        return null;
      }
    }),
  );
  return out.filter((x): x is Score => x !== null);
}

function dividendsFor(session: DemoSession, holdings: Holdings | null): Dividend[] {
  const before = session.multipliers;
  if (!holdings || !before) return [];
  return holdings.stocks
    .filter((s) => s.raw !== "0" && before[s.ticker] && BigInt(s.multiplier) > BigInt(before[s.ticker]))
    .map((s) => {
      const was = (BigInt(s.raw) * BigInt(before[s.ticker])) / 10n ** 18n;
      const now = (BigInt(s.raw) * BigInt(s.multiplier)) / 10n ** 18n;
      return { ticker: s.ticker, extraShares: Number(now - was) / 1e8 };
    });
}

const VOICE_BUCKET = "voice-notes";

async function voiceUrls(evs: DemoEvent[]) {
  const map = new Map<number, string>();
  const withVoice = evs.filter((e) => e.voice_path);
  if (!withVoice.length) return map;
  const { data } = await db().storage.from(VOICE_BUCKET).createSignedUrls(withVoice.map((e) => e.voice_path!), 3600);
  withVoice.forEach((e, i) => {
    const url = data?.[i]?.signedUrl;
    if (url) map.set(e.id, url);
  });
  return map;
}

export async function state(session: DemoSession): Promise<DemoState> {
  const [evs, holdings] = await Promise.all([events(session.id), kidHoldings(session.kid_id as Hash).catch(() => null)]);
  const [scores, voices] = await Promise.all([
    session.morning ? scoresFor(evs) : Promise.resolve([] as Score[]),
    voiceUrls(evs).catch(() => new Map<number, string>()),
  ]);
  return {
    session: { id: session.id, virtualNow: session.virtual_now, morning: session.morning },
    events: evs.map((e) => ({ ...e, txUrl: e.tx_hash ? txUrl(e.tx_hash) : null, voiceUrl: voices.get(e.id) ?? null })),
    holdings,
    scores,
    dividends: dividendsFor(session, holdings),
  };
}

// ---------------------------------------------------------------- kid: pitch

export async function createPitch(session: DemoSession, ticker: Ticker, why: string, coachQ?: string, coachA?: string) {
  const text = why.trim();
  if (!text) throw new DemoError("Tell Mum why you like this company.");
  if (text.length > 280) throw new DemoError("Keep it to 280 characters.");
  const existing = (await events(session.id)).find((e) => e.kind === "pitch" && e.status !== "failed");
  if (existing) throw new DemoError("Tobi already has a pitch waiting for Mum.");
  const { error } = await db().from("demo_events").insert({
    session_id: session.id,
    kind: "pitch",
    status: "pending",
    ticker,
    why: text,
    coach_q: coachQ?.slice(0, 200) ?? null,
    coach_a: coachA?.trim().slice(0, 280) || null,
    usdc_micro: Number(config.demo.pitchMicro),
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- parent: approve

export const MATCH_CHOICES = [0, 25, 50, 100];

export async function approvePitch(session: DemoSession, eventId: number, matchPct = 0) {
  if (!MATCH_CHOICES.includes(matchPct)) throw new DemoError("Pick a match of 0%, 25%, 50% or 100%.");
  const all = await events(session.id);
  if (all.some((e) => e.kind === "graduation" && e.status !== "failed")) throw new DemoError("Tobi has graduated. His shares are in his own wallet now.");
  const first = all.find((e) => e.kind === "allowance");
  if (first?.status === "sending") throw new DemoError("Tobi's allowance is still landing on Base. Try again in a few seconds.", 409);
  if (first?.status === "failed") throw new DemoError("Tobi's allowance didn't land, so there's nothing to spend. Tap Reset demo.", 409);
  const matchBps = BigInt(matchPct * 100);
  await assertCanSpend(session, config.demo.pitchMicro + (config.demo.pitchMicro * matchBps) / 10_000n);
  // Claim the pitch atomically so a double tap can never buy twice.
  const { data: claimed } = await db()
    .from("demo_events")
    .update({ status: "sending" })
    .eq("id", eventId)
    .eq("session_id", session.id)
    .eq("kind", "pitch")
    .eq("status", "pending")
    .select();
  const pitch = claimed?.[0] as DemoEvent | undefined;
  if (!pitch) throw new DemoError("This pitch was already answered.");
  try {
    const { hash, tokensOut, matchUsdc } = await pitchBuy(session.kid_id as Hash, pitch.ticker as Ticker, BigInt(pitch.usdc_micro), matchBps);
    await db()
      .from("demo_events")
      .update({
        status: "confirmed",
        tx_hash: hash,
        tokens_raw: tokensOut.toString(),
        match_micro: Number(matchUsdc),
        match_pct: matchPct,
        executed_at: new Date().toISOString(),
      })
      .eq("id", pitch.id);
  } catch (err) {
    await db().from("demo_events").update({ status: "failed", error: String(err).slice(0, 300) }).eq("id", pitch.id);
    throw new DemoError("The buy didn't go through, and no money moved. Please try again.", 503);
  }
}

// ---------------------------------------------------------------- relative: gift (queued for the night)

export const OCCASIONS = ["Birthday", "Good grades", "Christmas", "Eid", "Graduation"] as const;

export async function createGift(session: DemoSession, ticker: Ticker, occasion: string, message: string) {
  if (session.morning) throw new DemoError("It's already morning in Lagos. Reset the demo to send another overnight gift.");
  if (!OCCASIONS.includes(occasion as (typeof OCCASIONS)[number])) throw new DemoError("Pick an occasion.");
  if (tonightsGift(await events(session.id))) throw new DemoError("Aunty Funmi has already sent tonight's gift.");
  await assertCanSpend(session, config.demo.giftMicro);
  const { error } = await db().from("demo_events").insert({
    session_id: session.id,
    kind: "gift",
    status: "queued",
    ticker,
    occasion,
    message: message.trim().slice(0, 200) || null,
    gifter_name: "Aunty Funmi",
    usdc_micro: Number(config.demo.giftMicro),
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- relatives: group gift (escrow on-chain)

const GROUP_SHARE = () => config.demo.giftMicro / 2n; // each relative chips in half the target

/** The one gift a demo session gets tonight: a single gift or a group gift (not failed or called off). */
function tonightsGift(evs: DemoEvent[]) {
  return evs.find((e) => (e.kind === "gift" || e.kind === "group_gift") && e.status !== "failed" && e.status !== "rejected");
}

const openGroup = (evs: DemoEvent[]) => evs.find((e) => e.kind === "group_gift" && (e.status === "pending" || e.status === "queued"));

async function recordContribution(session: DemoSession, group: DemoEvent, gifter: string) {
  const amount = GROUP_SHARE();
  const { data: row, error } = await db()
    .from("demo_events")
    .insert({ session_id: session.id, kind: "contribution", status: "sending", gifter_name: gifter, usdc_micro: Number(amount), ref_event_id: group.id })
    .select()
    .single();
  if (error) throw error;
  try {
    const { hash } = await contributeTx(BigInt(group.chain_ref!), amount, stringToHex(gifter, { size: 32 }));
    await db().from("demo_events").update({ status: "confirmed", tx_hash: hash, executed_at: new Date().toISOString() }).eq("id", row.id);
  } catch (err) {
    await db().from("demo_events").update({ status: "failed", error: String(err).slice(0, 300) }).eq("id", row.id);
    throw new DemoError(`${gifter}'s contribution didn't go through, and no money moved. Please try again.`, 503);
  }
}

/** Aunty Funmi opens a group gift on-chain and chips in the first half. */
export async function startGroupGift(session: DemoSession, ticker: Ticker, occasion: string, message: string) {
  if (session.morning) throw new DemoError("It's already morning in Lagos. Reset the demo to send another overnight gift.");
  if (!OCCASIONS.includes(occasion as (typeof OCCASIONS)[number])) throw new DemoError("Pick an occasion.");
  if (tonightsGift(await events(session.id))) throw new DemoError("Aunty Funmi has already sent tonight's gift.");
  await assertCanSpend(session, GROUP_SHARE());
  const target = config.demo.giftMicro;
  const { data: group, error } = await db()
    .from("demo_events")
    .insert({
      session_id: session.id,
      kind: "group_gift",
      status: "sending",
      ticker,
      occasion,
      message: message.trim().slice(0, 200) || null,
      gifter_name: "Aunty Funmi and Uncle Dayo",
      usdc_micro: Number(target),
    })
    .select()
    .single();
  if (error) throw error;
  try {
    const { id } = await openGroupGiftTx(session.kid_id as Hash, ticker, target);
    await db().from("demo_events").update({ chain_ref: id.toString() }).eq("id", group.id);
    group.chain_ref = id.toString();
  } catch (err) {
    await db().from("demo_events").update({ status: "failed", error: String(err).slice(0, 300) }).eq("id", group.id);
    throw new DemoError("The group gift couldn't be started, and no money moved. Please try again.", 503);
  }
  await db().from("demo_events").update({ status: "pending" }).eq("id", group.id);
  await recordContribution(session, group as DemoEvent, "Aunty Funmi");
}

/** Uncle Dayo in Houston chips in the second half. Reaching the target queues it for the night shift. */
export async function chipIn(session: DemoSession) {
  if (session.morning) throw new DemoError("It's already morning in Lagos. The group gift has been delivered.");
  const evs = await events(session.id);
  const group = openGroup(evs);
  if (!group || !group.chain_ref) throw new DemoError("Aunty Funmi hasn't started a group gift yet.");
  if (evs.some((e) => e.kind === "contribution" && e.ref_event_id === group.id && e.gifter_name === "Uncle Dayo" && e.status !== "failed")) {
    throw new DemoError("Uncle Dayo has already chipped in.");
  }
  await assertCanSpend(session, GROUP_SHARE());
  await recordContribution(session, group, "Uncle Dayo");
  await db().from("demo_events").update({ status: "queued" }).eq("id", group.id).eq("status", "pending");
}

/** Calls the group gift off on-chain and refunds everyone's contribution. */
export async function callOffGroupGift(session: DemoSession) {
  if (session.morning) throw new DemoError("It's morning: the group gift has already been turned into shares.");
  const evs = await events(session.id);
  const group = openGroup(evs);
  if (!group || !group.chain_ref) throw new DemoError("There's no group gift to call off.");
  const { data: claimed } = await db().from("demo_events").update({ status: "sending" }).eq("id", group.id).in("status", ["pending", "queued"]).select();
  if (!claimed?.length) throw new DemoError("That group gift was already handled.");
  try {
    const { refundHash } = await cancelAndRefundTx(BigInt(group.chain_ref));
    await db().from("demo_events").update({ status: "rejected", tx_hash: refundHash, executed_at: new Date().toISOString() }).eq("id", group.id);
    await db().from("demo_events").update({ status: "refunded" }).eq("ref_event_id", group.id).eq("kind", "contribution").eq("status", "confirmed");
  } catch (err) {
    await db().from("demo_events").update({ status: group.status, error: String(err).slice(0, 300) }).eq("id", group.id);
    throw new DemoError("Calling it off didn't go through. Everyone's money is still safe in escrow. Please try again.", 503);
  }
}

// ---------------------------------------------------------------- the night shift

export async function skipToMorning(session: DemoSession) {
  // Only the first call flips the clock; later calls are no-ops.
  const { data: flipped } = await db()
    .from("demo_sessions")
    .update({ morning: true, virtual_now: lagosAt(1, 7, 0).toISOString() })
    .eq("id", session.id)
    .eq("morning", false)
    .select();
  if (!flipped?.length) return;

  const kidId = session.kid_id as Hash;
  const evs = await events(session.id);
  const queued = evs.filter((e) => e.kind === "gift" && e.status === "queued");
  // Aunty Funmi organised the group gift, so it can be closed with whatever was raised, even if Uncle Dayo didn't chip in.
  const groups = evs.filter((e) => e.kind === "group_gift" && (e.status === "pending" || e.status === "queued") && e.chain_ref);

  const deliverGroupGifts = async () => {
    for (const g of groups) {
      const raised = evs
        .filter((c) => c.kind === "contribution" && c.ref_event_id === g.id && c.status === "confirmed")
        .reduce((sum, c) => sum + BigInt(c.usdc_micro), 0n);
      if (raised === 0n) continue;
      await db().from("demo_events").update({ status: "sending" }).eq("id", g.id);
      try {
        const { hash, tokensOut } = await settleGroupGiftTx(BigInt(g.chain_ref!), g.ticker as Ticker, raised);
        await db()
          .from("demo_events")
          .update({ status: "confirmed", tx_hash: hash, tokens_raw: tokensOut.toString(), executed_at: new Date().toISOString() })
          .eq("id", g.id);
      } catch (err) {
        await db().from("demo_events").update({ status: "failed", error: String(err).slice(0, 300) }).eq("id", g.id);
      }
    }
  };

  const deliverGifts = async () => {
    for (const gift of queued) {
      await db().from("demo_events").update({ status: "sending" }).eq("id", gift.id);
      try {
        const tag = stringToHex(gift.gifter_name ?? "gift", { size: 32 });
        const { hash, tokensOut } = await giftFromRelayer(kidId, gift.ticker as Ticker, BigInt(gift.usdc_micro), tag);
        await db()
          .from("demo_events")
          .update({ status: "confirmed", tx_hash: hash, tokens_raw: tokensOut.toString(), executed_at: new Date().toISOString() })
          .eq("id", gift.id);
      } catch (err) {
        await db().from("demo_events").update({ status: "failed", error: String(err).slice(0, 300) }).eq("id", gift.id);
      }
    }
  };

  const midnightAllowance = async () => {
    const { data: ev } = await db()
      .from("demo_events")
      .insert({ session_id: session.id, kind: "allowance", status: "sending", usdc_micro: Number(config.demo.allowanceMicro) })
      .select()
      .single();
    try {
      const { hash } = await releaseAllowance(kidId);
      await db().from("demo_events").update({ status: "confirmed", tx_hash: hash, executed_at: new Date().toISOString() }).eq("id", ev!.id);
    } catch (err) {
      await db().from("demo_events").update({ status: "failed", error: String(err).slice(0, 300) }).eq("id", ev!.id);
    }
  };

  // Independent transactions from one wallet; viem's nonce manager keeps their nonces in order.
  await Promise.all([deliverGifts(), deliverGroupGifts(), midnightAllowance()]);
}

// ---------------------------------------------------------------- thank-you

const MAX_VOICE_BYTES = 1_000_000; // about 30 seconds of compressed audio, with room to spare
const VOICE_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac"];

async function ensureVoiceBucket() {
  const { data } = await db().storage.getBucket(VOICE_BUCKET);
  if (data) return;
  // Private bucket: notes are only ever served through short-lived signed links.
  await db().storage.createBucket(VOICE_BUCKET, { public: false, fileSizeLimit: MAX_VOICE_BYTES, allowedMimeTypes: VOICE_TYPES });
}

export async function thankYou(session: DemoSession, giftId: number, text: string, voice?: Blob) {
  const msg = text.trim();
  if (!msg && !voice) throw new DemoError("Write a short thank-you or record a voice note.");
  const voiceType = voice?.type.split(";")[0] ?? "";
  if (voice) {
    if (!VOICE_TYPES.includes(voiceType)) throw new DemoError("That recording format isn't supported. Try a written thank-you.");
    if (voice.size > MAX_VOICE_BYTES) throw new DemoError("Keep the voice note under 30 seconds.");
  }
  const evs = await events(session.id);
  const gift = evs.find((e) => e.id === giftId && (e.kind === "gift" || e.kind === "group_gift") && e.status === "confirmed");
  if (!gift) throw new DemoError("That gift hasn't arrived yet.");
  if (evs.some((e) => e.kind === "thank_you" && e.ref_event_id === giftId)) throw new DemoError("Tobi already said thank you.");
  let voicePath: string | null = null;
  if (voice) {
    await ensureVoiceBucket();
    const ext = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/aac": "aac" }[voiceType] ?? "webm";
    voicePath = `demo/${session.id}/${giftId}.${ext}`;
    const { error: upErr } = await db().storage.from(VOICE_BUCKET).upload(voicePath, voice, { contentType: voiceType, upsert: true });
    if (upErr) throw new DemoError("The voice note didn't upload. Please try again or write one instead.", 503);
  }
  const { error } = await db()
    .from("demo_events")
    .insert({
      session_id: session.id,
      kind: "thank_you",
      status: "confirmed",
      message: msg.slice(0, 280) || null,
      voice_path: voicePath,
      ref_event_id: giftId,
    });
  if (error) throw error;
}

// ---------------------------------------------------------------- graduation (fast-forward to 18)

/**
 * Mum graduates Tobi: every share and his savings move out of the family vault in one transaction.
 * In the demo, "Tobi's own wallet" is Allowance's demo wallet, so the cents aren't sent to an address nobody controls.
 */
export async function graduate(session: DemoSession) {
  if (!session.morning) throw new DemoError("Graduation comes after the Morning Report. Skip to morning first.");
  const evs = await events(session.id);
  if (evs.some((e) => e.kind === "graduation" && e.status !== "failed")) throw new DemoError("Tobi has already graduated.");
  if (evs.some((e) => e.status === "sending")) throw new DemoError("Something is still landing on Base. Try again in a few seconds.", 409);
  const to = relayerAddress();
  const { data: row, error } = await db()
    .from("demo_events")
    .insert({ session_id: session.id, kind: "graduation", status: "sending", message: to })
    .select()
    .single();
  if (error) throw error;
  try {
    const { hash } = await graduateTx(session.kid_id as Hash, to);
    await db().from("demo_events").update({ status: "confirmed", tx_hash: hash, executed_at: new Date().toISOString() }).eq("id", row.id);
  } catch (err) {
    await db().from("demo_events").update({ status: "failed", error: String(err).slice(0, 300) }).eq("id", row.id);
    throw new DemoError("Graduation didn't go through, and nothing moved. Please try again.", 503);
  }
}

// ---------------------------------------------------------------- replay (cap fallback)

export async function replay() {
  const { data } = await db()
    .from("demo_events")
    .select("kind, ticker, usdc_micro, tokens_raw, gifter_name, tx_hash, executed_at")
    .eq("status", "confirmed")
    .not("tx_hash", "is", null)
    .in("kind", ["pitch", "gift", "group_gift", "allowance", "graduation"])
    .order("executed_at", { ascending: false })
    .limit(6);
  return (data ?? []).map((e) => ({
    ...e,
    company: e.ticker ? STOCKS[e.ticker as Ticker]?.name ?? e.ticker : null,
    txUrl: txUrl(e.tx_hash as string),
  }));
}
