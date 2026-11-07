import { AccountError, toResponse } from "@/lib/accounts/errors";
import { deviceSignIn, deviceStatus, requestJoin } from "@/lib/accounts/devices";

/** A kid's device: is it waiting for approval, approved, or not joined yet? */
export async function GET() {
  try {
    return Response.json(await deviceStatus());
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action === "join") await requestJoin(body.code, body.label);
    else if (body.action === "pin") await deviceSignIn(body.pin);
    else throw new AccountError("Unknown action.", 404);
    return Response.json(await deviceStatus());
  } catch (err) {
    return toResponse(err);
  }
}
