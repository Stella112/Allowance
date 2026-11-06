import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "../db";
import { AccountError } from "./errors";
import type { Parent } from "./parents";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export type Kid = {
  id: string;
  parent_id: string;
  nickname: string;
  birth_year: number;
  avatar: string;
  chain_kid_id: `0x${string}`;
  consent_at: string;
  paused: boolean;
  max_per_pitch_micro: number;
  max_per_month_micro: number;
  match_pct: number;
  allowance_micro: number;
  allowance_period: "weekly" | "monthly";
  graduated_to: string | null;
  created_at: string;
};

/** Columns safe to send to the browser (never the PIN hash). */
export const KID_COLUMNS =
  "id, parent_id, nickname, birth_year, avatar, chain_kid_id, consent_at, paused, max_per_pitch_micro, max_per_month_micro, match_pct, allowance_micro, allowance_period, graduated_to, created_at";

export const AVATARS = ["🦁", "🐼", "🦊", "🐯", "🐸", "🦄", "🐙", "🚀", "⚽", "🎨"];
const PIN_WINDOW_MS = 15 * 60_000;
const MAX_WRONG_PINS = 5;

async function hashPin(pin: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pin, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

async function pinMatches(pin: string, stored: string) {
  const [alg, salt, key] = stored.split("$");
  if (alg !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await scrypt(pin, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

const currentYear = () => new Date().getUTCFullYear();

/** Adds a child. Only a nickname, birth year, avatar and hashed PIN are stored, plus when the parent consented. */
export async function addKid(parent: Parent, input: { nickname: unknown; birthYear: unknown; avatar: unknown; pin: unknown; consent: unknown }) {
  const nickname = typeof input.nickname === "string" ? input.nickname.trim() : "";
  if (!/^[\p{L}][\p{L}\p{M}' -]{0,19}$/u.test(nickname)) throw new AccountError("Use a first name or nickname: letters only, up to 20.");
  const birthYear = Number(input.birthYear);
  const age = currentYear() - birthYear;
  if (!Number.isInteger(birthYear) || age < 6 || age > 17) throw new AccountError("Allowance is for kids aged 6 to 17.");
  const avatar = typeof input.avatar === "string" && AVATARS.includes(input.avatar) ? input.avatar : AVATARS[0];
  const pin = typeof input.pin === "string" ? input.pin : "";
  if (!/^\d{4}$/.test(pin)) throw new AccountError("The PIN must be 4 digits.");
  if (/^(\d)\1{3}$/.test(pin) || pin === "1234") throw new AccountError("Pick a PIN that's harder to guess than 1234 or 1111.");
  if (input.consent !== true) throw new AccountError("Please tick the consent box to add a child.");

  const { data, error } = await db()
    .from("kids")
    .insert({
      parent_id: parent.id,
      nickname,
      birth_year: birthYear,
      avatar,
      pin_hash: await hashPin(pin),
      chain_kid_id: `0x${randomBytes(32).toString("hex")}`, // anonymous on-chain id, never a name
      consent_at: new Date().toISOString(),
    })
    .select(KID_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as Kid;
}

export async function listKids(parentId: string) {
  const { data, error } = await db().from("kids").select(KID_COLUMNS).eq("parent_id", parentId).order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as Kid[];
}

export async function getKid(kidId: string) {
  const { data } = await db().from("kids").select(KID_COLUMNS).eq("id", kidId).maybeSingle();
  return (data as unknown as Kid) ?? null;
}

export async function kidOfParent(parent: Parent, kidId: unknown) {
  if (typeof kidId !== "string") throw new AccountError("Pick a child.");
  const kid = await getKid(kidId);
  if (!kid || kid.parent_id !== parent.id) throw new AccountError("That child isn't in your family.", 404);
  return kid;
}

/** Checks a kid's PIN. At most 5 wrong tries per 15 minutes, counted on the server. */
export async function checkPin(kidId: string, pin: unknown) {
  const since = new Date(Date.now() - PIN_WINDOW_MS).toISOString();
  const { count } = await db().from("pin_attempts").select("id", { count: "exact", head: true }).eq("kid_id", kidId).eq("ok", false).gte("at", since);
  if ((count ?? 0) >= MAX_WRONG_PINS) throw new AccountError("Too many wrong PINs. Wait 15 minutes, or ask your parent to reset it.", 429);
  const { data } = await db().from("kids").select("pin_hash, paused").eq("id", kidId).maybeSingle();
  if (!data) throw new AccountError("That profile doesn't exist.", 404);
  const ok = typeof pin === "string" && /^\d{4}$/.test(pin) && (await pinMatches(pin, data.pin_hash));
  await db().from("pin_attempts").insert({ kid_id: kidId, ok });
  if (!ok) throw new AccountError(`That's not the right PIN. ${Math.max(0, MAX_WRONG_PINS - 1 - (count ?? 0))} tries left.`, 401);
  if (data.paused) throw new AccountError("This profile is paused. Ask your parent.", 403);
}

/** Parent resets a kid's PIN (and clears the wrong-try counter). */
export async function resetPin(kid: Kid, pin: unknown) {
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) throw new AccountError("The PIN must be 4 digits.");
  await db().from("kids").update({ pin_hash: await hashPin(pin) }).eq("id", kid.id);
  await db().from("pin_attempts").delete().eq("kid_id", kid.id);
}

/** Parent settings for a kid. Limits are checked by the app; the vault contract also enforces its own caps. */
export async function updateKidSettings(kid: Kid, input: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if (input.paused !== undefined) patch.paused = input.paused === true;
  if (input.matchPct !== undefined) {
    const m = Number(input.matchPct);
    if (!Number.isInteger(m) || m < 0 || m > 100) throw new AccountError("Match must be 0 to 100%.");
    patch.match_pct = m;
  }
  const dollars = (v: unknown, max: number, label: string) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > max) throw new AccountError(`${label} must be between $0 and $${max}.`);
    return Math.round(n * 1e6);
  };
  if (input.maxPerPitch !== undefined) patch.max_per_pitch_micro = dollars(input.maxPerPitch, 5, "Max per pitch");
  if (input.maxPerMonth !== undefined) patch.max_per_month_micro = dollars(input.maxPerMonth, 20, "Max per month");
  if (input.allowance !== undefined) patch.allowance_micro = dollars(input.allowance, 20, "Allowance");
  if (input.allowancePeriod !== undefined) {
    if (input.allowancePeriod !== "weekly" && input.allowancePeriod !== "monthly") throw new AccountError("Pick weekly or monthly.");
    patch.allowance_period = input.allowancePeriod;
  }
  if (!Object.keys(patch).length) return kid;
  const { data, error } = await db().from("kids").update(patch).eq("id", kid.id).select(KID_COLUMNS).single();
  if (error) throw error;
  return data as unknown as Kid;
}
