import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { keccak256, stringToHex, toHex, type Hash } from "viem";
import { config, txUrl } from "./config";
import { db, type DemoEvent, type DemoSession } from "./db";
import { demoFunds, giftFromRelayer, kidHoldings, pitchBuy, releaseAllowance, setAndReleaseAllowance, type Holdings } from "./chain";
import { STOCKS, type Ticker } from "./stocks";

export class DemoError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const SPEND_KINDS = ["pitch", "gift"] as const;
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
    .select("usdc_micro")
    .in("kind", [...SPEND_KINDS])
    .in("status", [...LIVE_STATUSES])
    .gte("created_at", since.toISOString());
  if (sessionId) q = q.eq("session_id", sessionId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).reduce((s, r) => s + BigInt(r.usdc_micro), 0n);
}

const startOfUtcDay = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

/** True when a new session can afford its full night shift (pitch + gift + 2 allowances). */
async function budgetAvailable() {
  const d = config.demo;
  const perSession = d.pitchMicro + d.giftMicro;
  const [today, funds] = await Promise.all([spentSince(startOfUtcDay()), demoFunds()]);
  return (
    today + perSession <= d.dailyCapMicro &&
    funds.pool >= d.allowanceMicro * 2n &&
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

export async function startSession(ipHash: string): Promise<{ session: DemoSession | null; replay: boolean }> {
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db().from("demo_sessions").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", hourAgo);
  if ((count ?? 0) >= config.demo.maxSessionsPerIpPerHour) {
    throw new DemoError("You've started a lot of demos this hour. Please try again a little later.", 429);
  }
  if (!(await budgetAvailable())) return { session: null, replay: true };

  const id = randomUUID();
  const kidId = keccak256(toHex(`allowance-demo-kid:${id}`)); // anonymous on-chain id, never a name
  const { data: session, error } = await db()
    .from("demo_sessions")
    .insert({ id, kid_id: kidId, virtual_now: lagosAt(0, 21, 30).toISOString(), ip_hash: ipHash })
    .select()
    .single();
  if (error) throw error;

  // Tobi starts with last week's allowance so there is something to pitch with (real transactions).
  const { data: ev } = await db()
    .from("demo_events")
    .insert({ session_id: id, kind: "allowance", status: "sending", usdc_micro: Number(config.demo.allowanceMicro) })
    .select()
    .single();
  try {
    const { hash } = await setAndReleaseAllowance(kidId);
    await db().from("demo_events").update({ status: "confirmed", tx_hash: hash, executed_at: new Date().toISOString() }).eq("id", ev!.id);
  } catch (err) {
    await db().from("demo_events").update({ status: "failed", error: String(err).slice(0, 300) }).eq("id", ev!.id);
    throw new DemoError("We couldn't reach Base just now. Please try again in a moment.", 503);
  }
  return { session: session as DemoSession, replay: false };
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

export type DemoState = {
  session: { id: string; virtualNow: string; morning: boolean };
  events: (DemoEvent & { txUrl: string | null })[];
  holdings: Holdings | null;
};

export async function state(session: DemoSession): Promise<DemoState> {
  const [evs, holdings] = await Promise.all([events(session.id), kidHoldings(session.kid_id as Hash).catch(() => null)]);
  return {
    session: { id: session.id, virtualNow: session.virtual_now, morning: session.morning },
    events: evs.map((e) => ({ ...e, txUrl: e.tx_hash ? txUrl(e.tx_hash) : null })),
    holdings,
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

export async function approvePitch(session: DemoSession, eventId: number) {
  await assertCanSpend(session, config.demo.pitchMicro);
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
    const { hash, tokensOut } = await pitchBuy(session.kid_id as Hash, pitch.ticker as Ticker, BigInt(pitch.usdc_micro));
    await db()
      .from("demo_events")
      .update({ status: "confirmed", tx_hash: hash, tokens_raw: tokensOut.toString(), executed_at: new Date().toISOString() })
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
  const existing = (await events(session.id)).find((e) => e.kind === "gift" && e.status !== "failed");
  if (existing) throw new DemoError("Aunty Funmi has already sent tonight's gift.");
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
  const queued = (await events(session.id)).filter((e) => e.kind === "gift" && e.status === "queued");
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
}

// ---------------------------------------------------------------- thank-you

export async function thankYou(session: DemoSession, giftId: number, text: string) {
  const msg = text.trim();
  if (!msg) throw new DemoError("Write a short thank-you.");
  const evs = await events(session.id);
  const gift = evs.find((e) => e.id === giftId && e.kind === "gift" && e.status === "confirmed");
  if (!gift) throw new DemoError("That gift hasn't arrived yet.");
  if (evs.some((e) => e.kind === "thank_you" && e.ref_event_id === giftId)) throw new DemoError("Tobi already said thank you.");
  const { error } = await db()
    .from("demo_events")
    .insert({ session_id: session.id, kind: "thank_you", status: "confirmed", message: msg.slice(0, 280), ref_event_id: giftId });
  if (error) throw error;
}

// ---------------------------------------------------------------- replay (cap fallback)

export async function replay() {
  const { data } = await db()
    .from("demo_events")
    .select("kind, ticker, usdc_micro, tokens_raw, gifter_name, tx_hash, executed_at")
    .eq("status", "confirmed")
    .not("tx_hash", "is", null)
    .in("kind", ["pitch", "gift", "allowance"])
    .order("executed_at", { ascending: false })
    .limit(6);
  return (data ?? []).map((e) => ({
    ...e,
    company: e.ticker ? STOCKS[e.ticker as Ticker]?.name ?? e.ticker : null,
    txUrl: txUrl(e.tx_hash as string),
  }));
}
