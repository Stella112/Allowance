import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "../db";

/**
 * App sessions for real families. The cookie holds a random 32-byte token; the database stores only
 * its SHA-256 hash, so a database leak can't be replayed as a login.
 */
const COOKIE = "allow_sid";
const PARENT_TTL_MS = 7 * 24 * 3600_000; // a week
const KID_TTL_MS = 30 * 24 * 3600_000; // a month on an approved device

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type AppSession = {
  role: "parent" | "kid";
  parent_id: string;
  kid_id: string | null;
  device_id: string | null;
  expires_at: string;
};

export async function startSession(s: { role: "parent" | "kid"; parentId: string; kidId?: string; deviceId?: string }) {
  const token = randomBytes(32).toString("base64url");
  const ttl = s.role === "parent" ? PARENT_TTL_MS : KID_TTL_MS;
  const { error } = await db()
    .from("app_sessions")
    .insert({
      token_hash: hashToken(token),
      role: s.role,
      parent_id: s.parentId,
      kid_id: s.kidId ?? null,
      device_id: s.deviceId ?? null,
      expires_at: new Date(Date.now() + ttl).toISOString(),
    });
  if (error) throw error;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.floor(ttl / 1000),
    path: "/",
  });
}

export async function currentAppSession(): Promise<AppSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const { data } = await db().from("app_sessions").select("role, parent_id, kid_id, device_id, expires_at").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data || new Date(data.expires_at) < new Date()) return null;
  return data as AppSession;
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db().from("app_sessions").delete().eq("token_hash", hashToken(token));
  jar.delete(COOKIE);
}
