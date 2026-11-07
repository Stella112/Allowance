import { AccountError, toResponse } from "@/lib/accounts/errors";
import { giftQuote, publicGiftLink, recordGift } from "@/lib/accounts/gifts";

export const maxDuration = 90; // recording waits for the relative's transaction receipt

/** Public: what a relative needs to send a gift. `?quote=1&ticker=&amount=` returns a slippage-protected quote. */
export async function GET(req: Request, ctx: RouteContext<"/api/gift/[code]">) {
  try {
    const { code } = await ctx.params;
    const url = new URL(req.url);
    if (url.searchParams.get("quote")) return Response.json(await giftQuote(code, url.searchParams.get("ticker"), url.searchParams.get("amount")));
    return Response.json(await publicGiftLink(code, url.searchParams.get("who")));
  } catch (err) {
    return toResponse(err);
  }
}

/** Public: record a gift the relative just sent from their own wallet (verified on Base by the server). */
export async function POST(req: Request, ctx: RouteContext<"/api/gift/[code]">) {
  try {
    const { code } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action !== "record") throw new AccountError("Unknown action.", 404);
    await recordGift(code, { txHash: body.txHash, gifterName: body.gifterName, occasion: body.occasion, message: body.message });
    return Response.json(await publicGiftLink(code, typeof body.who === "string" ? body.who : null));
  } catch (err) {
    return toResponse(err);
  }
}
