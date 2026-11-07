import "server-only";
import type { Hash } from "viem";
import { allowanceSchedule, groupGift, releaseAllowance, settleGroupGiftTx, vaultInfo } from "../chain";
import { db } from "../db";
import { isTicker } from "../stocks";
import { KID_COLUMNS, type Kid } from "./kids";

const MAX_ACTIONS_PER_RUN = 20; // each is one on-chain transaction from the operator
const LOCK_MINUTES = 30;

type Result = { kid?: string; group?: string; action: string; ok: boolean; tx?: string; note?: string };

/**
 * The night shift, run once a night by the scheduler (Vercel Cron, 23:00 UTC = midnight in Lagos).
 * Safe to run twice: the vault itself refuses a second allowance in the same period, a group gift can only
 * be settled once, and a lock row stops two runs overlapping.
 */
export async function runNightShift(now = new Date()): Promise<{ results: Result[]; skipped?: string }> {
  // Lock: one run at a time. A run that died leaves a lock that expires after LOCK_MINUTES.
  const since = new Date(now.getTime() - LOCK_MINUTES * 60_000).toISOString();
  const { data: running } = await db().from("allowance_runs").select("id").eq("status", "sending").gte("created_at", since).limit(1);
  if (running?.length) return { results: [], skipped: "Another night shift is running." };

  const results: Result[] = [];
  const { data: parents } = await db().from("parents").select("id, vault").not("vault", "is", null);

  for (const p of parents ?? []) {
    if (results.length >= MAX_ACTIONS_PER_RUN) break;
    const vault = p.vault as `0x${string}`;
    const { data: kids } = await db().from("kids").select(KID_COLUMNS).eq("parent_id", p.id).eq("paused", false).is("graduated_to", null).gt("allowance_micro", 0);
    for (const kid of (kids ?? []) as unknown as Kid[]) {
      if (results.length >= MAX_ACTIONS_PER_RUN) break;
      const s = await allowanceSchedule(vault, kid.chain_kid_id as Hash).catch(() => null);
      if (!s || s.amount === 0n || Number(s.nextReleaseAt) * 1000 > now.getTime()) continue;
      const pool = (await vaultInfo(vault)).familyUsdc;
      if (pool < s.amount) {
        results.push({ kid: kid.id, action: "allowance", ok: false, note: "Family pool is too low." });
        continue;
      }
      const { data: run } = await db()
        .from("allowance_runs")
        .insert({ kid_id: kid.id, usdc_micro: Number(s.amount), status: "sending" })
        .select("id")
        .single();
      try {
        const { hash } = await releaseAllowance(kid.chain_kid_id as Hash, vault);
        await db().from("allowance_runs").update({ status: "confirmed", tx_hash: hash }).eq("id", run!.id);
        results.push({ kid: kid.id, action: "allowance", ok: true, tx: hash });
      } catch (err) {
        await db().from("allowance_runs").update({ status: "failed", error: String(err).slice(0, 300) }).eq("id", run!.id);
        results.push({ kid: kid.id, action: "allowance", ok: false, note: String(err).slice(0, 120) });
      }
    }
  }

  // Group gifts that reached their target turn into shares overnight.
  const { data: links } = await db().from("gift_links").select("code, kid_id, parent_id, ticker, group_chain_id").eq("kind", "group").not("group_chain_id", "is", null);
  for (const l of links ?? []) {
    if (results.length >= MAX_ACTIONS_PER_RUN) break;
    if (!isTicker(l.ticker)) continue;
    const { data: p } = await db().from("parents").select("vault").eq("id", l.parent_id).single();
    if (!p?.vault) continue;
    const vault = p.vault as `0x${string}`;
    const g = await groupGift(vault, BigInt(l.group_chain_id)).catch(() => null);
    if (!g || g.status !== "open" || g.raised === 0n || g.raised < g.target) continue;
    try {
      const { hash, tokensOut } = await settleGroupGiftTx(BigInt(l.group_chain_id), l.ticker, g.raised, vault);
      await db()
        .from("gifts")
        .upsert(
          {
            kid_id: l.kid_id,
            link_code: l.code,
            kind: "group_settled",
            gifter_name: "The family",
            ticker: l.ticker,
            usdc_micro: Number(g.raised),
            tokens_raw: tokensOut.toString(),
            tx_hash: hash,
          },
          { onConflict: "tx_hash", ignoreDuplicates: true },
        );
      results.push({ group: l.code, action: "settle-group", ok: true, tx: hash });
    } catch (err) {
      results.push({ group: l.code, action: "settle-group", ok: false, note: String(err).slice(0, 120) });
    }
  }
  return { results };
}
