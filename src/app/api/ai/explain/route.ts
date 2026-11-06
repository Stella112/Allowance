import { explainerCard } from "@/lib/ai";
import { isTicker, type AgeBand } from "@/lib/stocks";


const BANDS: AgeBand[] = ["6-9", "10-13", "14-17"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticker = url.searchParams.get("ticker");
  const band = (url.searchParams.get("band") ?? "10-13") as AgeBand;
  if (!isTicker(ticker) || !BANDS.includes(band)) return Response.json({ error: "Bad request" }, { status: 400 });
  return Response.json(await explainerCard(ticker, band));
}
