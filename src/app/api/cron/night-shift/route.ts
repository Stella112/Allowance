import { runNightShift } from "@/lib/accounts/nightshift";

// Vercel Cron calls this with GET and `Authorization: Bearer <CRON_SECRET>` (docs: vercel.com/docs/cron-jobs/manage-cron-jobs).
export const maxDuration = 300; // the Hobby plan maximum

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await runNightShift());
  } catch (err) {
    console.error("[night-shift] error:", err instanceof Error ? err : JSON.stringify(err));
    return Response.json({ error: "Night shift failed." }, { status: 500 });
  }
}
