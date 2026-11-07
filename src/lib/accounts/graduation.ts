import "server-only";
import { CdpClient } from "@coinbase/cdp-sdk";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import type { Hash } from "viem";
import { canReceive, graduatedTo } from "../chain";
import { config } from "../config";
import { db } from "../db";
import { STOCKS, type Ticker } from "../stocks";
import { liveInvite } from "./devices";
import { AccountError } from "./errors";
import { getKid, kidOfParent } from "./kids";
import { verifyApproval } from "./passkeys";
import type { Parent } from "./parents";

let _cdp: CdpClient | null = null;
const cdp = () => (_cdp ??= new CdpClient({ apiKeyId: config.cdpApiKeyId(), apiKeySecret: config.cdpApiKeySecret() }));

/**
 * At 18, the kid opens their graduation link and signs in with their own email. We check that sign-in on the
 * server, take their new wallet, and check it passes every stock's transfer rules before the parent can graduate them.
 */
export async function claimGraduation(code: unknown, accessToken: unknown) {
  const invite = await liveInvite(code, "graduate");
  if (typeof accessToken !== "string") throw new AccountError("Please sign in first.", 401);
  let user;
  try {
    user = await cdp().endUser.validateAccessToken({ accessToken });
  } catch {
    throw new AccountError("We couldn't confirm your sign-in. Please sign in again.", 401);
  }
  const wallet = user.evmSmartAccounts[0] ?? user.evmAccounts[0];
  if (!wallet) throw new AccountError("Your wallet is still being set up. Try again in a moment.", 409);
  const { data: parent } = await db().from("parents").select("wallet, vault").eq("id", invite.parent_id).single();
  if (parent?.wallet?.toLowerCase() === wallet.toLowerCase()) throw new AccountError("That's your parent's wallet. Sign in with your own email.", 409);
  if (!parent?.vault) throw new AccountError("Your family vault isn't set up.", 409);
  for (const t of Object.keys(STOCKS) as Ticker[]) {
    if (!(await canReceive(parent.vault as `0x${string}`, STOCKS[t].token, wallet as `0x${string}`))) {
      throw new AccountError(`Your wallet can't hold ${t} under its transfer rules, so graduation can't move it.`, 409);
    }
  }
  await db().from("invites").update({ graduate_wallet: wallet }).eq("code", invite.code);
  const kid = await getKid(invite.kid_id);
  return { nickname: kid?.nickname ?? "", wallet };
}

/** The wallet a kid claimed for graduation, if they have. */
export async function pendingGraduation(kidId: string) {
  const { data } = await db()
    .from("invites")
    .select("code, graduate_wallet, expires_at")
    .eq("kid_id", kidId)
    .eq("purpose", "graduate")
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] as { code: string; graduate_wallet: string | null; expires_at: string } | undefined) ?? null;
}

/** Face ID for "graduate this kid to this wallet". The browser then sends graduate() from the parent's wallet. */
export async function checkGraduationApproval(parent: Parent, kidId: unknown, response: AuthenticationResponseJSON | undefined) {
  if (!response) throw new AccountError("Face ID is needed to graduate.", 401);
  const kid = await kidOfParent(parent, kidId);
  const pending = await pendingGraduation(kid.id);
  if (!pending?.graduate_wallet) throw new AccountError(`${kid.nickname} hasn't signed up with their own wallet yet.`, 409);
  await verifyApproval(parent, "graduate", kid.id, response);
  return { kid, wallet: pending.graduate_wallet as `0x${string}` };
}

/** After the parent's transaction lands, confirm on-chain and close the kid's profile in the app. */
export async function confirmGraduation(parent: Parent, kidId: unknown) {
  const kid = await kidOfParent(parent, kidId);
  if (!parent.vault) throw new AccountError("No family vault.", 409);
  const to = await graduatedTo(kid.chain_kid_id as Hash, parent.vault as `0x${string}`);
  if (!to) throw new AccountError("We don't see the graduation on Base yet. Give it a few seconds.", 409);
  await db().from("kids").update({ graduated_to: to, paused: true }).eq("id", kid.id);
  const pending = await pendingGraduation(kid.id);
  if (pending) await db().from("invites").update({ used_at: new Date().toISOString() }).eq("code", pending.code);
  return to;
}
