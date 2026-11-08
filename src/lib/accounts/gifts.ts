import "server-only";
import { randomBytes } from "node:crypto";
import type { Hash } from "viem";
import { assertVaultCanHold, contributionOf, groupGift, openGroupGiftTx, quoteMinOut, readGiftTx } from "../chain";
import { config, txUrl } from "../config";
import { db } from "../db";
import { STOCKS, isTicker, type Ticker } from "../stocks";
import { signedVoiceUrls } from "../voice";
import { AccountError } from "./errors";
import { getKid, kidOfParent } from "./kids";
import type { Parent } from "./parents";

export const OCCASIONS = ["Birthday", "Good grades", "Christmas", "Eid", "Graduation", "Just because"] as const;
const MAX_GIFT_MICRO = 5_000_000; // the vault's per-transaction cap is $5

export type GiftLink = {
  code: string;
  parent_id: string;
  kid_id: string;
  kind: "single" | "group";
  ticker: Ticker | null;
  target_micro: number | null;
  group_chain_id: string | null;
  created_at: string;
};

const newCode = () => randomBytes(9).toString("base64url"); // 12 characters, unguessable

/**
 * A parent makes a link to share with relatives. A group link opens a group gift on-chain right away
 * (Allowance's operator is the organizer, so the night shift can turn it into shares when it's ready).
 */
export async function createGiftLink(parent: Parent, input: { kidId: unknown; kind: unknown; ticker: unknown; target: unknown }) {
  const kid = await kidOfParent(parent, input.kidId);
  if (!parent.vault) throw new AccountError("Create your family vault first.", 409);
  if (kid.graduated_to) throw new AccountError(`${kid.nickname} has graduated. Gifts now go to their own wallet.`, 409);
  const kind = input.kind === "group" ? "group" : "single";
  const code = newCode();
  if (kind === "single") {
    // Optional: the parent picks the company and a suggested amount; otherwise the relative chooses.
    const ticker = isTicker(input.ticker) ? input.ticker : null;
    const suggested = input.target === undefined || input.target === null || input.target === "" ? null : Math.round(Number(input.target) * 1e6);
    if (suggested !== null && (!Number.isFinite(suggested) || suggested < 10_000 || suggested > MAX_GIFT_MICRO)) {
      throw new AccountError("Pick an amount between $0.01 and $5.");
    }
    const { error } = await db().from("gift_links").insert({ code, parent_id: parent.id, kid_id: kid.id, kind, ticker, target_micro: suggested });
    if (error) throw error;
    return code;
  }
  if (!isTicker(input.ticker)) throw new AccountError("Pick the company the family will chip in for.");
  const target = Math.round(Number(input.target) * 1e6);
  if (!Number.isFinite(target) || target < 100_000 || target > 20_000_000) throw new AccountError("Pick a target between $0.10 and $20.");
  const { id } = await openGroupGiftTx(kid.chain_kid_id as Hash, input.ticker, BigInt(target), parent.vault as `0x${string}`);
  const { error } = await db()
    .from("gift_links")
    .insert({ code, parent_id: parent.id, kid_id: kid.id, kind, ticker: input.ticker, target_micro: target, group_chain_id: id.toString() });
  if (error) throw error;
  return code;
}

export async function giftLinksOf(parentId: string) {
  const { data } = await db().from("gift_links").select().eq("parent_id", parentId).order("created_at", { ascending: false }).limit(20);
  return (data ?? []) as GiftLink[];
}

async function linkByCode(code: string) {
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(code)) throw new AccountError("That gift link isn't valid.", 404);
  const { data } = await db().from("gift_links").select().eq("code", code).maybeSingle();
  if (!data) throw new AccountError("That gift link isn't valid.", 404);
  const link = data as GiftLink;
  const kid = await getKid(link.kid_id);
  const { data: parent } = await db().from("parents").select("vault, timezone").eq("id", link.parent_id).single();
  if (!kid || !parent?.vault) throw new AccountError("That gift link isn't valid any more.", 404);
  return { link, kid, vault: parent.vault as `0x${string}`, timezone: parent.timezone as string };
}

/** What a relative sees on the gift page. Only the kid's nickname and avatar; never a surname or anything else. */
export async function publicGiftLink(code: string, who?: string | null) {
  const { link, kid, vault, timezone } = await linkByCode(code);
  const group =
    link.kind === "group" && link.group_chain_id ? await groupGift(vault, BigInt(link.group_chain_id)).catch(() => null) : null;
  const mine =
    group && who && /^0x[0-9a-fA-F]{40}$/.test(who) ? (await contributionOf(vault, BigInt(link.group_chain_id!), who as `0x${string}`)).toString() : null;
  const { data: gifts } = await db()
    .from("gifts")
    .select("id, kind, gifter_name, occasion, ticker, usdc_micro, tx_hash, created_at")
    .eq("link_code", code)
    .order("created_at", { ascending: false })
    .limit(20);
  const giftIds = (gifts ?? []).map((g) => g.id);
  const { data: thanks } = giftIds.length
    ? await db().from("thank_yous").select("gift_id, message, voice_path, created_at").in("gift_id", giftIds)
    : { data: [] };
  const voices = await signedVoiceUrls((thanks ?? []).flatMap((t) => (t.voice_path ? [t.voice_path as string] : []))).catch(() => new Map<string, string>());
  return {
    kid: { nickname: kid.nickname, avatar: kid.avatar, chainKidId: kid.chain_kid_id, timezone, graduated: !!kid.graduated_to },
    vault,
    usdc: config.usdc(),
    tokens: Object.fromEntries((Object.keys(STOCKS) as Ticker[]).map((t) => [t, STOCKS[t].token])),
    kind: link.kind,
    ticker: link.ticker,
    suggestedMicro: link.kind === "single" ? link.target_micro : null,
    group: group
      ? {
          id: link.group_chain_id,
          status: group.status,
          target: group.target.toString(),
          raised: group.raised.toString(),
          mine,
        }
      : null,
    occasions: OCCASIONS,
    maxGiftMicro: MAX_GIFT_MICRO,
    gifts: (gifts ?? []).map((g) => ({ ...g, txUrl: txUrl(g.tx_hash) })),
    thanks: (thanks ?? []).map((t) => ({ gift_id: t.gift_id, message: t.message, created_at: t.created_at, voiceUrl: t.voice_path ? voices.get(t.voice_path) ?? null : null })),
  };
}

/** A fresh minimum-out for a single gift, so the relative's transaction is protected against slippage. */
export async function giftQuote(code: string, ticker: unknown, amount: unknown) {
  const { vault } = await linkByCode(code);
  if (!isTicker(ticker)) throw new AccountError("Pick Apple or Nvidia.");
  const micro = Math.round(Number(amount) * 1e6);
  if (!Number.isFinite(micro) || micro < 10_000 || micro > MAX_GIFT_MICRO) throw new AccountError("Gifts are from $0.01 to $5.");
  await assertVaultCanHold(vault, ticker);
  const { minOut } = await quoteMinOut(ticker, BigInt(micro));
  return { minOut: minOut.toString(), deadline: Math.floor(Date.now() / 1000) + 600 };
}

/** Records a gift after reading the relative's transaction on Base. The browser's claims are not trusted. */
export async function recordGift(code: string, input: { txHash: unknown; gifterName: unknown; occasion: unknown; message: unknown }) {
  const { link, kid, vault } = await linkByCode(code);
  if (typeof input.txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(input.txHash)) throw new AccountError("Missing transaction.");
  const found = await readGiftTx(
    input.txHash as Hash,
    vault,
    kid.chain_kid_id as Hash,
    link.group_chain_id ? BigInt(link.group_chain_id) : null,
  ).catch(() => null);
  if (!found) throw new AccountError("We couldn't find this gift on Base. If you just sent it, try again in a moment.", 404);
  const ticker = found.token
    ? ((Object.keys(STOCKS) as Ticker[]).find((t) => STOCKS[t].token.toLowerCase() === found.token!.toLowerCase()) ?? null)
    : link.ticker;
  const occasion = typeof input.occasion === "string" && (OCCASIONS as readonly string[]).includes(input.occasion) ? input.occasion : null;
  const { error } = await db()
    .from("gifts")
    .upsert(
      {
        kid_id: kid.id,
        link_code: code,
        kind: found.kind,
        gifter_name: typeof input.gifterName === "string" ? input.gifterName.trim().slice(0, 40) || null : null,
        occasion,
        message: typeof input.message === "string" ? input.message.trim().slice(0, 200) || null : null,
        ticker,
        usdc_micro: Number(found.usdcIn),
        tokens_raw: found.tokensOut ? found.tokensOut.toString() : null,
        from_address: found.from,
        tx_hash: input.txHash,
      },
      { onConflict: "tx_hash", ignoreDuplicates: true },
    );
  if (error) throw error;
}
