import "server-only";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { Hash } from "viem";
import { allowanceSchedule, kidHoldings, pitchBuy, relayerAddress, usdcBalance, vaultInfo, vaultOfParent } from "../chain";
import { config, txUrl } from "../config";
import { db } from "../db";
import { isTicker, type Ticker } from "../stocks";
import { AccountError } from "./errors";
import { giftLinksOf } from "./gifts";
import { getKid, listKids, type Kid } from "./kids";
import { verifyApproval } from "./passkeys";
import type { Parent } from "./parents";

const addr = (s: string) => s as `0x${string}`;
const PERIOD_SEC = { weekly: 7n * 86_400n, monthly: 30n * 86_400n } as const;

export type Pitch = {
  id: number;
  kid_id: string;
  ticker: Ticker;
  why: string;
  coach_q: string | null;
  coach_a: string | null;
  usdc_micro: number;
  match_pct: number;
  match_micro: number;
  status: "pending" | "sending" | "confirmed" | "declined" | "failed";
  tokens_raw: string | null;
  tx_hash: string | null;
  created_at: string;
  decided_at: string | null;
};

const withTx = <T extends { tx_hash: string | null }>(r: T) => ({ ...r, txUrl: r.tx_hash ? txUrl(r.tx_hash) : null });

async function kidChainState(vault: `0x${string}` | null, kid: Kid) {
  if (!vault) return { holdings: null, allowance: null };
  const [holdings, schedule] = await Promise.all([
    kidHoldings(kid.chain_kid_id as Hash, vault).catch(() => null),
    allowanceSchedule(vault, kid.chain_kid_id as Hash).catch(() => null),
  ]);
  return {
    holdings,
    allowance: schedule
      ? { amountMicro: schedule.amount.toString(), periodSec: schedule.period.toString(), nextReleaseAt: Number(schedule.nextReleaseAt) }
      : null,
  };
}

/** Everything the parent dashboard shows. On-chain values are read from Base, not from our database. */
export async function familyState(parent: Parent) {
  const vault = parent.vault ? addr(parent.vault) : null;
  const kids = await listKids(parent.id);
  const [walletUsdc, info, kidStates, pitches, links] = await Promise.all([
    usdcBalance(addr(parent.wallet)).catch(() => null),
    vault ? vaultInfo(vault).catch(() => null) : Promise.resolve(null),
    Promise.all(kids.map((k) => kidChainState(vault, k))),
    kids.length
      ? db()
          .from("pitches")
          .select()
          .in(
            "kid_id",
            kids.map((k) => k.id),
          )
          .order("created_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] }),
    giftLinksOf(parent.id),
  ]);
  return {
    parent: { email: parent.email, wallet: parent.wallet, vault: parent.vault, timezone: parent.timezone },
    factory: config.factory(),
    usdc: config.usdc(),
    walletUsdcMicro: walletUsdc?.toString() ?? null,
    familyUsdcMicro: info?.familyUsdc.toString() ?? null,
    kids: kids.map((k, i) => ({ ...k, ...kidStates[i], periodSec: PERIOD_SEC[k.allowance_period].toString() })),
    pitches: ((pitches.data ?? []) as Pitch[]).map(withTx),
    giftLinks: links.map((l) => ({ code: l.code, kid_id: l.kid_id, kind: l.kind, ticker: l.ticker, target_micro: l.target_micro })),
  };
}

/**
 * After the parent's wallet calls factory.createVault(), confirm it on-chain (never trusting the browser):
 * the vault must be owned by the parent's wallet and operated by our relayer.
 */
export async function confirmVault(parent: Parent) {
  const vault = await vaultOfParent(addr(parent.wallet));
  if (!vault) throw new AccountError("We don't see your family vault on Base yet. Give it a few seconds.", 409);
  const info = await vaultInfo(vault);
  if (info.owner.toLowerCase() !== parent.wallet.toLowerCase()) throw new AccountError("That vault isn't owned by your wallet.", 409);
  if (info.operator.toLowerCase() !== relayerAddress().toLowerCase()) throw new AccountError("That vault has an unexpected operator.", 409);
  await db().from("parents").update({ vault }).eq("id", parent.id);
  return vault;
}

// ---------------------------------------------------------------- pitches

export async function kidState(kid: Kid) {
  const { data: parent } = await db().from("parents").select("vault").eq("id", kid.parent_id).single();
  const vault = parent?.vault ? addr(parent.vault) : null;
  const [{ holdings, allowance }, { data: pitches }] = await Promise.all([
    kidChainState(vault, kid),
    db().from("pitches").select().eq("kid_id", kid.id).order("created_at", { ascending: false }).limit(20),
  ]);
  return {
    kid: { id: kid.id, nickname: kid.nickname, avatar: kid.avatar, birth_year: kid.birth_year, max_per_pitch_micro: kid.max_per_pitch_micro },
    hasVault: !!vault,
    holdings,
    allowance,
    pitches: ((pitches ?? []) as Pitch[]).map(withTx),
  };
}

export async function createPitch(kid: Kid, input: { ticker: unknown; why: unknown; amount: unknown; coachQ: unknown; coachA: unknown }) {
  if (kid.paused) throw new AccountError("Your profile is paused. Ask your parent.", 403);
  if (!isTicker(input.ticker)) throw new AccountError("Pick Apple or Nvidia.");
  const why = typeof input.why === "string" ? input.why.trim() : "";
  if (!why) throw new AccountError("Tell your parent why you like this company.");
  if (why.length > 280) throw new AccountError("Keep it to 280 characters.");
  const usdc = Math.round(Number(input.amount) * 1e6);
  if (!Number.isFinite(usdc) || usdc < 10_000) throw new AccountError("Pitch at least $0.01.");
  if (usdc > kid.max_per_pitch_micro) throw new AccountError(`Your parent's limit is $${(kid.max_per_pitch_micro / 1e6).toFixed(2)} per pitch.`);
  const { count } = await db().from("pitches").select("id", { count: "exact", head: true }).eq("kid_id", kid.id).eq("status", "pending");
  if ((count ?? 0) >= 3) throw new AccountError("You already have 3 pitches waiting. Let your parent answer those first.");
  const { error } = await db()
    .from("pitches")
    .insert({
      kid_id: kid.id,
      ticker: input.ticker,
      why,
      coach_q: typeof input.coachQ === "string" ? input.coachQ.slice(0, 200) : null,
      coach_a: typeof input.coachA === "string" ? input.coachA.trim().slice(0, 280) || null : null,
      usdc_micro: usdc,
      status: "pending",
    });
  if (error) throw error;
}

async function pitchOfParent(parent: Parent, pitchId: unknown) {
  const id = Number(pitchId);
  if (!Number.isInteger(id)) throw new AccountError("Pick a pitch.");
  const { data: pitch } = await db().from("pitches").select().eq("id", id).maybeSingle();
  const kid = pitch ? await getKid(pitch.kid_id) : null;
  if (!pitch || !kid || kid.parent_id !== parent.id) throw new AccountError("That pitch isn't in your family.", 404);
  return { pitch: pitch as Pitch, kid };
}

export async function declinePitch(parent: Parent, pitchId: unknown) {
  const { pitch } = await pitchOfParent(parent, pitchId);
  await db().from("pitches").update({ status: "declined", decided_at: new Date().toISOString() }).eq("id", pitch.id).eq("status", "pending");
}

/**
 * The parent approved with Face ID. Verify that on the server for exactly this pitch, check the limits,
 * then the operator buys the shares in the family vault (the contract enforces its own caps too).
 */
export async function approvePitch(parent: Parent, pitchId: unknown, response: AuthenticationResponseJSON | undefined) {
  if (!response) throw new AccountError("Face ID is needed to approve.", 401);
  const { pitch, kid } = await pitchOfParent(parent, pitchId);
  await verifyApproval(parent, "approve-pitch", String(pitch.id), response);
  if (!parent.vault) throw new AccountError("Create your family vault first.", 409);
  if (kid.paused) throw new AccountError(`${kid.nickname}'s profile is paused.`, 409);
  if (pitch.usdc_micro > kid.max_per_pitch_micro) throw new AccountError("This pitch is over the per-pitch limit you set.", 409);

  const matchMicro = Math.floor((pitch.usdc_micro * kid.match_pct) / 100);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: recent } = await db().from("pitches").select("usdc_micro, match_micro").eq("kid_id", kid.id).eq("status", "confirmed").gte("decided_at", monthAgo);
  const spent = (recent ?? []).reduce((s, r) => s + Number(r.usdc_micro) + Number(r.match_micro), 0);
  if (spent + pitch.usdc_micro + matchMicro > kid.max_per_month_micro) throw new AccountError(`This would go over ${kid.nickname}'s monthly limit.`, 409);

  const { data: claimed } = await db().from("pitches").update({ status: "sending" }).eq("id", pitch.id).eq("status", "pending").select();
  if (!claimed?.length) throw new AccountError("This pitch was already answered.", 409);
  try {
    const { hash, tokensOut, matchUsdc } = await pitchBuy(
      kid.chain_kid_id as Hash,
      pitch.ticker,
      BigInt(pitch.usdc_micro),
      BigInt(kid.match_pct * 100),
      addr(parent.vault),
    );
    await db()
      .from("pitches")
      .update({
        status: "confirmed",
        tx_hash: hash,
        tokens_raw: tokensOut.toString(),
        match_pct: kid.match_pct,
        match_micro: Number(matchUsdc),
        decided_at: new Date().toISOString(),
      })
      .eq("id", pitch.id);
  } catch (err) {
    await db().from("pitches").update({ status: "failed", error: String(err).slice(0, 300) }).eq("id", pitch.id);
    throw new AccountError("The buy didn't go through, and no money moved. Check there's enough in savings and try again.", 503);
  }
}
