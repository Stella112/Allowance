import { AccountError, toResponse } from "@/lib/accounts/errors";
import { createPitch, kidState } from "@/lib/accounts/family";
import { sendThankYou } from "@/lib/accounts/report";
import { checkPin, getKid, listKids } from "@/lib/accounts/kids";
import { currentAppSession, endSession, startSession } from "@/lib/accounts/session";

async function requireKid() {
  const s = await currentAppSession();
  if (!s || s.role !== "kid" || !s.kid_id) throw new AccountError("Please enter your PIN.", 401);
  const kid = await getKid(s.kid_id);
  if (!kid) throw new AccountError("Please enter your PIN.", 401);
  return kid;
}

/** The signed-in kid's savings, shares and pitches; or, on a parent's device, the profiles to switch to. */
export async function GET() {
  try {
    const s = await currentAppSession();
    if (s?.role === "parent") {
      const kids = await listKids(s.parent_id);
      return Response.json({ profiles: kids.map((k) => ({ id: k.id, nickname: k.nickname, avatar: k.avatar })) });
    }
    return Response.json(await kidState(await requireKid()));
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    // Voice thank-yous arrive as multipart form data; everything else is JSON.
    if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const kid = await requireKid();
      const form = await req.formData();
      const voice = form.get("voice");
      await sendThankYou(kid, form.get("giftId"), form.get("text") ?? "", voice instanceof Blob && voice.size > 0 ? voice : undefined);
      return Response.json(await kidState(kid));
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    switch (body.action) {
      case "switch": {
        // "Switch to Tobi" on the parent's own device: the parent session vouches for the device, the PIN for the kid.
        const s = await currentAppSession();
        if (!s || s.role !== "parent") throw new AccountError("Ask your parent to open Allowance on this device first.", 401);
        const kid = await getKid(String(body.kidId));
        if (!kid || kid.parent_id !== s.parent_id) throw new AccountError("That profile isn't in this family.", 404);
        await checkPin(kid.id, body.pin);
        await endSession();
        await startSession({ role: "kid", parentId: kid.parent_id, kidId: kid.id });
        return Response.json(await kidState(kid));
      }
      case "pitch": {
        const kid = await requireKid();
        await createPitch(kid, { ticker: body.ticker, why: body.why, amount: body.amount, coachQ: body.coachQ, coachA: body.coachA });
        return Response.json(await kidState(kid));
      }
      case "thank-you": {
        const kid = await requireKid();
        await sendThankYou(kid, body.giftId, body.text);
        return Response.json(await kidState(kid));
      }
      case "leave":
        await endSession();
        return Response.json({ ok: true });
      default:
        throw new AccountError("Unknown action.", 404);
    }
  } catch (err) {
    return toResponse(err);
  }
}
