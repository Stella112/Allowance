import "server-only";
import { CdpClient } from "@coinbase/cdp-sdk";
import { config } from "../config";
import { db } from "../db";
import { AccountError } from "./errors";
import { currentAppSession, startSession } from "./session";

export type Parent = {
  id: string;
  cdp_user_id: string;
  email: string | null;
  wallet: string;
  vault: string | null;
  timezone: string;
  created_at: string;
};

let _cdp: CdpClient | null = null;
const cdp = () => (_cdp ??= new CdpClient({ apiKeyId: config.cdpApiKeyId(), apiKeySecret: config.cdpApiKeySecret() }));

/**
 * Checks a Coinbase sign-in token on the server (never trusting the browser), then creates or finds
 * the parent and starts our own session.
 */
export async function signInParent(accessToken: string): Promise<Parent> {
  let user;
  try {
    user = await cdp().endUser.validateAccessToken({ accessToken });
  } catch {
    throw new AccountError("We couldn't confirm your sign-in. Please sign in again.", 401);
  }
  const email = user.authenticationMethods.flatMap((m) => ("email" in m && typeof m.email === "string" ? [m.email] : []))[0] ?? null;
  const wallet = user.evmSmartAccounts[0] ?? user.evmAccounts[0];
  if (!wallet) throw new AccountError("Your wallet is still being set up. Please try again in a moment.", 409);

  const { data, error } = await db()
    .from("parents")
    .upsert({ cdp_user_id: user.userId, email, wallet }, { onConflict: "cdp_user_id" })
    .select()
    .single();
  if (error) throw error;
  await startSession({ role: "parent", parentId: data.id });
  return data as Parent;
}

/** The signed-in parent, or an error if this isn't a parent session. */
export async function requireParent(): Promise<Parent> {
  const s = await currentAppSession();
  if (!s || s.role !== "parent") throw new AccountError("Please sign in as a parent.", 401);
  const { data } = await db().from("parents").select().eq("id", s.parent_id).maybeSingle();
  if (!data) throw new AccountError("Please sign in as a parent.", 401);
  return data as Parent;
}
