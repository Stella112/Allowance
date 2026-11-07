import "server-only";
import { db } from "./db";

/** Voice thank-yous live in a private Supabase bucket and are only ever served through short-lived signed links. */
export const VOICE_BUCKET = "voice-notes";
export const MAX_VOICE_BYTES = 1_000_000; // about 30 seconds of compressed audio, with room to spare
const VOICE_EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/aac": "aac" };

async function ensureBucket() {
  const { data } = await db().storage.getBucket(VOICE_BUCKET);
  if (data) return;
  await db().storage.createBucket(VOICE_BUCKET, { public: false, fileSizeLimit: MAX_VOICE_BYTES, allowedMimeTypes: Object.keys(VOICE_EXT) });
}

/** Returns an error message for an unacceptable recording, or null. */
export function voiceProblem(voice: Blob) {
  const type = voice.type.split(";")[0];
  if (!VOICE_EXT[type]) return "That recording format isn't supported. Try a written thank-you.";
  if (voice.size > MAX_VOICE_BYTES) return "Keep the voice note under 30 seconds.";
  return null;
}

/** Uploads a recording under `pathWithoutExt` and returns the stored path. */
export async function uploadVoice(pathWithoutExt: string, voice: Blob) {
  await ensureBucket();
  const type = voice.type.split(";")[0];
  const path = `${pathWithoutExt}.${VOICE_EXT[type]}`;
  const { error } = await db().storage.from(VOICE_BUCKET).upload(path, voice, { contentType: type, upsert: true });
  if (error) throw error;
  return path;
}

export async function signedVoiceUrls(paths: string[]) {
  const map = new Map<string, string>();
  if (!paths.length) return map;
  const { data } = await db().storage.from(VOICE_BUCKET).createSignedUrls(paths, 3600);
  paths.forEach((p, i) => {
    const url = data?.[i]?.signedUrl;
    if (url) map.set(p, url);
  });
  return map;
}
