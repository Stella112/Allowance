import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "../db";
import { AccountError } from "./errors";
import { checkPin, getKid, kidOfParent } from "./kids";
import type { Parent } from "./parents";
import { endSession, hashToken, startSession } from "./session";

const DEVICE_COOKIE = "allow_dev";
const INVITE_TTL_MS = 24 * 3600_000;
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I/L, easy to read aloud

/** A 6-character family code (also used in the invite link and QR code). One use, 24 hours. */
export async function createInvite(parent: Parent, kidId: unknown, purpose: "device" | "graduate" = "device") {
  const kid = await kidOfParent(parent, kidId);
  const code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
  const { error } = await db()
    .from("invites")
    .insert({ code, parent_id: parent.id, kid_id: kid.id, purpose, expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString() });
  if (error) throw error;
  return code;
}

export async function liveInvite(code: unknown, purpose: "device" | "graduate") {
  const c = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{6}$/.test(c)) throw new AccountError("That code isn't right. It has 6 letters and numbers.", 404);
  const { data } = await db().from("invites").select().eq("code", c).eq("purpose", purpose).maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at) < new Date()) throw new AccountError("That code has expired or was already used. Ask your parent for a new one.", 404);
  return data as { code: string; parent_id: string; kid_id: string; expires_at: string; graduate_wallet: string | null };
}

/** A kid's new device asks to join with a family code. The parent must approve it before the PIN works. */
export async function requestJoin(code: unknown, label: unknown) {
  const invite = await liveInvite(code, "device");
  const name = typeof label === "string" && label.trim() ? label.trim().slice(0, 40) : "New device";
  const token = randomBytes(32).toString("base64url");
  // Claim the invite exactly once.
  const { data: claimed } = await db().from("invites").update({ used_at: new Date().toISOString() }).eq("code", invite.code).is("used_at", null).select();
  if (!claimed?.length) throw new AccountError("That code was already used. Ask your parent for a new one.", 409);
  const { data: device, error } = await db()
    .from("devices")
    .insert({ parent_id: invite.parent_id, kid_id: invite.kid_id, label: name, status: "pending", token_hash: hashToken(token) })
    .select("id")
    .single();
  if (error) throw error;
  (await cookies()).set(DEVICE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 365 * 86_400, path: "/" });
  return device.id as string;
}

async function thisDevice() {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!token) return null;
  const { data } = await db().from("devices").select("id, kid_id, parent_id, label, status").eq("token_hash", hashToken(token)).maybeSingle();
  return data as { id: string; kid_id: string; parent_id: string; label: string; status: "pending" | "approved" | "removed" } | null;
}

/** What a kid's device should show: waiting for approval, ready for the PIN, or removed. */
export async function deviceStatus() {
  const d = await thisDevice();
  if (!d) return { status: "none" as const };
  const kid = await getKid(d.kid_id);
  return { status: d.status, label: d.label, kid: kid ? { nickname: kid.nickname, avatar: kid.avatar } : null };
}

/** PIN on an approved device starts the kid's session, tied to that device. */
export async function deviceSignIn(pin: unknown) {
  const d = await thisDevice();
  if (!d || d.status !== "approved") throw new AccountError("This device isn't approved yet. Ask your parent.", 403);
  await checkPin(d.kid_id, pin);
  await endSession();
  await startSession({ role: "kid", parentId: d.parent_id, kidId: d.kid_id, deviceId: d.id });
  await db().from("devices").update({ last_seen_at: new Date().toISOString() }).eq("id", d.id);
}

export async function devicesOf(parentId: string) {
  const { data } = await db().from("devices").select("id, kid_id, label, status, created_at, last_seen_at").eq("parent_id", parentId).neq("status", "removed").order("created_at", { ascending: false });
  return data ?? [];
}

/** Parent approves or removes a device. Removing it also signs that device out. */
export async function setDevice(parent: Parent, deviceId: unknown, approve: boolean) {
  const { data: d } = await db().from("devices").select("id, parent_id").eq("id", String(deviceId)).maybeSingle();
  if (!d || d.parent_id !== parent.id) throw new AccountError("That device isn't in your family.", 404);
  await db()
    .from("devices")
    .update(approve ? { status: "approved", approved_at: new Date().toISOString() } : { status: "removed" })
    .eq("id", d.id);
  if (!approve) await db().from("app_sessions").delete().eq("device_id", d.id);
}

/** A kid session on a device the parent removed (or never approved) is no longer valid. */
export async function deviceStillAllowed(deviceId: string | null) {
  if (!deviceId) return true; // "Switch to Tobi" on the parent's own device
  const { data } = await db().from("devices").select("status").eq("id", deviceId).maybeSingle();
  return data?.status === "approved";
}

