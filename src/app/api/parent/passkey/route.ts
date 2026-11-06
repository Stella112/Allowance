import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { AccountError, toResponse } from "@/lib/accounts/errors";
import { registrationOptions, verifyRegistration } from "@/lib/accounts/passkeys";
import { requireParent } from "@/lib/accounts/parents";

/** Options to register Face ID / fingerprint on this device. */
export async function GET() {
  try {
    return Response.json(await registrationOptions(await requireParent()));
  } catch (err) {
    return toResponse(err);
  }
}

/** Verifies and saves the new passkey. */
export async function POST(req: Request) {
  try {
    const parent = await requireParent();
    const body = (await req.json().catch(() => ({}))) as { response?: RegistrationResponseJSON; label?: string };
    if (!body.response) throw new AccountError("Missing Face ID response.");
    await verifyRegistration(parent, body.response, typeof body.label === "string" ? body.label : "");
    return Response.json({ ok: true });
  } catch (err) {
    return toResponse(err);
  }
}
