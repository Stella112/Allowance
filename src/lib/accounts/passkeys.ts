import "server-only";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { config } from "../config";
import { db } from "../db";
import { AccountError } from "./errors";
import type { Parent } from "./parents";

/**
 * Passkeys (Face ID / fingerprint) for parents. Every approval that moves money needs a fresh passkey
 * check, verified here on the server, so a kid up late on a parent's phone can't approve their own pitch.
 */

const CHALLENGE_TTL_MS = 5 * 60_000;
export type Purpose = "register" | "approve-pitch" | "graduate" | "settings";

const b64url = {
  enc: (u: Uint8Array) => Buffer.from(u).toString("base64url"),
  dec: (s: string) => new Uint8Array(Buffer.from(s, "base64url")),
};

async function saveChallenge(parentId: string, challenge: string, purpose: Purpose, ref: string | null) {
  // One live challenge per parent and purpose.
  await db().from("webauthn_challenges").delete().eq("parent_id", parentId).eq("purpose", purpose);
  const { error } = await db()
    .from("webauthn_challenges")
    .insert({ parent_id: parentId, challenge, purpose, ref, expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString() });
  if (error) throw error;
}

/** Claims the live challenge for this purpose and ref exactly once. */
async function takeChallenge(parentId: string, purpose: Purpose, ref: string | null) {
  let q = db()
    .from("webauthn_challenges")
    .update({ used_at: new Date().toISOString() })
    .eq("parent_id", parentId)
    .eq("purpose", purpose)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString());
  q = ref === null ? q.is("ref", null) : q.eq("ref", ref);
  const { data } = await q.select("challenge");
  const challenge = data?.[0]?.challenge as string | undefined;
  if (!challenge) throw new AccountError("That Face ID request expired. Please try again.", 401);
  return challenge;
}

export async function hasPasskey(parentId: string) {
  const { count } = await db().from("passkeys").select("id", { count: "exact", head: true }).eq("parent_id", parentId);
  return (count ?? 0) > 0;
}

export async function registrationOptions(parent: Parent) {
  const { data: existing } = await db().from("passkeys").select("id, transports").eq("parent_id", parent.id);
  const options = await generateRegistrationOptions({
    rpName: "Allowance",
    rpID: config.webauthnRpId(),
    userName: parent.email ?? "Parent",
    userID: new TextEncoder().encode(parent.id),
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((c) => ({ id: c.id as string, transports: (c.transports ?? undefined) as never })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  await saveChallenge(parent.id, options.challenge, "register", null);
  return options;
}

export async function verifyRegistration(parent: Parent, response: RegistrationResponseJSON, label: string) {
  const expectedChallenge = await takeChallenge(parent.id, "register", null);
  let result;
  try {
    result = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: config.webauthnOrigin(),
      expectedRPID: config.webauthnRpId(),
      requireUserVerification: true,
    });
  } catch {
    throw new AccountError("We couldn't set up Face ID on this device. Please try again.", 400);
  }
  if (!result.verified || !result.registrationInfo) throw new AccountError("We couldn't set up Face ID on this device. Please try again.", 400);
  const { credential } = result.registrationInfo;
  const { error } = await db()
    .from("passkeys")
    .insert({
      id: credential.id,
      parent_id: parent.id,
      public_key: b64url.enc(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? null,
      label: label.slice(0, 60) || "This device",
    });
  if (error) throw error;
}

/** Options for a passkey check tied to one specific action (e.g. approving pitch 42). */
export async function approvalOptions(parent: Parent, purpose: Exclude<Purpose, "register">, ref: string) {
  const { data: creds } = await db().from("passkeys").select("id, transports").eq("parent_id", parent.id);
  if (!creds?.length) throw new AccountError("Set up Face ID or fingerprint first.", 409);
  const options = await generateAuthenticationOptions({
    rpID: config.webauthnRpId(),
    allowCredentials: creds.map((c) => ({ id: c.id as string, transports: (c.transports ?? undefined) as never })),
    userVerification: "required",
  });
  await saveChallenge(parent.id, options.challenge, purpose, ref);
  return options;
}

/** Throws unless `response` is a fresh, user-verified passkey check for exactly this action. */
export async function verifyApproval(parent: Parent, purpose: Exclude<Purpose, "register">, ref: string, response: AuthenticationResponseJSON) {
  const expectedChallenge = await takeChallenge(parent.id, purpose, ref);
  const { data: cred } = await db().from("passkeys").select().eq("id", response.id).eq("parent_id", parent.id).maybeSingle();
  if (!cred) throw new AccountError("That Face ID isn't registered to your account.", 401);
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: config.webauthnOrigin(),
      expectedRPID: config.webauthnRpId(),
      requireUserVerification: true,
      credential: {
        id: cred.id,
        publicKey: b64url.dec(cred.public_key),
        counter: Number(cred.counter),
        transports: cred.transports ?? undefined,
      },
    });
  } catch {
    throw new AccountError("Face ID didn't match. Nothing was approved.", 401);
  }
  if (!result.verified) throw new AccountError("Face ID didn't match. Nothing was approved.", 401);
  await db()
    .from("passkeys")
    .update({ counter: result.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq("id", cred.id);
}
