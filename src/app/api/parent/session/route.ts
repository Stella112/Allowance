import { AccountError, toResponse } from "@/lib/accounts/errors";
import { hasPasskey } from "@/lib/accounts/passkeys";
import { requireParent, signInParent } from "@/lib/accounts/parents";
import { endSession } from "@/lib/accounts/session";

/** Who is signed in, and what setup is left. */
export async function GET() {
  try {
    const parent = await requireParent();
    return Response.json({
      parent: { email: parent.email, wallet: parent.wallet, vault: parent.vault, timezone: parent.timezone },
      hasPasskey: await hasPasskey(parent.id),
    });
  } catch (err) {
    return toResponse(err);
  }
}

/** Exchanges a Coinbase sign-in token (checked on the server) for an Allowance session. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { accessToken?: unknown };
    if (typeof body.accessToken !== "string" || !body.accessToken) throw new AccountError("Missing sign-in token.");
    const parent = await signInParent(body.accessToken);
    return Response.json({ ok: true, hasPasskey: await hasPasskey(parent.id) });
  } catch (err) {
    return toResponse(err);
  }
}

export async function DELETE() {
  await endSession();
  return Response.json({ ok: true });
}
