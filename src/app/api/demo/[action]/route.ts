import { cookies, headers } from "next/headers";
import {
  approvePitch,
  createGift,
  createPitch,
  DemoError,
  getSession,
  ipHashOf,
  replay,
  skipToMorning,
  startSession,
  state,
  thankYou,
} from "@/lib/demo";
import { isTicker } from "@/lib/stocks";

export const maxDuration = 120; // on-chain steps wait for confirmations

const COOKIE = "demo_sid";

async function ipHash() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return ipHashOf(ip);
}

async function currentSession() {
  const session = await getSession((await cookies()).get(COOKIE)?.value);
  if (!session) throw new DemoError("Your demo session has ended. Tap Start to begin a fresh one.", 401);
  return session;
}

const str = (v: unknown, name: string) => {
  if (typeof v !== "string") throw new DemoError(`Missing ${name}.`);
  return v;
};

export async function GET(_req: Request, ctx: RouteContext<"/api/demo/[action]">) {
  const { action } = await ctx.params;
  try {
    if (action === "state") return Response.json(await state(await currentSession()));
    if (action === "replay") return Response.json({ replay: await replay() });
    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request, ctx: RouteContext<"/api/demo/[action]">) {
  const { action } = await ctx.params;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (action === "start" || action === "reset") {
      const { session, replay: isReplay } = await startSession(await ipHash());
      const jar = await cookies();
      if (!session) {
        jar.delete(COOKIE);
        return Response.json({ replay: true });
      }
      jar.set(COOKIE, session.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 86_400, path: "/" });
      return Response.json({ replay: isReplay, state: await state(session) });
    }

    const session = await currentSession();
    switch (action) {
      case "pitch": {
        if (!isTicker(body.ticker)) throw new DemoError("Pick Apple or Nvidia.");
        await createPitch(session, body.ticker, str(body.why, "why"), typeof body.coachQ === "string" ? body.coachQ : undefined, typeof body.coachA === "string" ? body.coachA : undefined);
        break;
      }
      case "approve":
        await approvePitch(session, Number(body.eventId));
        break;
      case "gift": {
        if (!isTicker(body.ticker)) throw new DemoError("Pick Apple or Nvidia.");
        await createGift(session, body.ticker, str(body.occasion, "occasion"), typeof body.message === "string" ? body.message : "");
        break;
      }
      case "skip-to-morning":
        await skipToMorning(session);
        break;
      case "thank-you":
        await thankYou(session, Number(body.giftId), str(body.text, "text"));
        break;
      default:
        return Response.json({ error: "Not found" }, { status: 404 });
    }
    const fresh = await getSession(session.id);
    return Response.json({ state: await state(fresh!) });
  } catch (err) {
    return toResponse(err);
  }
}

function toResponse(err: unknown) {
  if (err instanceof DemoError) return Response.json({ error: err.message }, { status: err.status });
  console.error(err);
  return Response.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
}
