import { AccountError, toResponse } from "@/lib/accounts/errors";
import { approvePitch, confirmVault, declinePitch, familyState } from "@/lib/accounts/family";
import { addKid, kidOfParent, resetPin, updateKidSettings } from "@/lib/accounts/kids";
import { approvalOptions } from "@/lib/accounts/passkeys";
import { requireParent } from "@/lib/accounts/parents";

export const maxDuration = 120; // approvals wait for an on-chain confirmation

export async function GET() {
  try {
    return Response.json(await familyState(await requireParent()));
  } catch (err) {
    return toResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const parent = await requireParent();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    switch (body.action) {
      case "add-kid":
        await addKid(parent, { nickname: body.nickname, birthYear: body.birthYear, avatar: body.avatar, pin: body.pin, consent: body.consent });
        break;
      case "kid-settings":
        await updateKidSettings(await kidOfParent(parent, body.kidId), body);
        break;
      case "reset-pin":
        await resetPin(await kidOfParent(parent, body.kidId), body.pin);
        break;
      case "confirm-vault":
        await confirmVault(parent);
        break;
      case "approve-options":
        return Response.json(await approvalOptions(parent, "approve-pitch", String(Number(body.pitchId))));
      case "approve":
        await approvePitch(parent, body.pitchId, body.response as never);
        break;
      case "decline":
        await declinePitch(parent, body.pitchId);
        break;
      default:
        throw new AccountError("Unknown action.", 404);
    }
    // Re-read the parent: confirm-vault may have just saved the vault address.
    return Response.json(await familyState(await requireParent()));
  } catch (err) {
    return toResponse(err);
  }
}
