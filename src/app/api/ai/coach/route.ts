import { coachQuestion } from "@/lib/ai";
import { isTicker, type AgeBand } from "@/lib/stocks";

const BANDS: AgeBand[] = ["6-9", "10-13", "14-17"];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { ticker?: unknown; band?: unknown; why?: unknown };
  const band = (typeof body.band === "string" ? body.band : "10-13") as AgeBand;
  if (!isTicker(body.ticker) || !BANDS.includes(band) || typeof body.why !== "string" || !body.why.trim()) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  return Response.json(await coachQuestion(body.ticker, band, body.why));
}
