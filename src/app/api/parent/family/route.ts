import { AccountError, toResponse } from "@/lib/accounts/errors";
import { approvePitch, confirmVault, declinePitch, familyState } from "@/lib/accounts/family";
import { createInvite, setDevice } from "@/lib/accounts/devices";
import { createGiftLink } from "@/lib/accounts/gifts";
import { checkGraduationApproval, confirmGraduation } from "@/lib/accounts/graduation";
import QRCode from "qrcode";
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
      case "gift-link": {
        const code = await createGiftLink(parent, { kidId: body.kidId, kind: body.kind, ticker: body.ticker, target: body.target });
        return Response.json({ ...(await familyState(parent)), newLink: code });
      }
      case "invite": {
        // A 6-character family code, an invite link and a QR code for the same one-use, 24-hour code.
        const code = await createInvite(parent, body.kidId, "device");
        const link = `${new URL(req.url).origin}/join?code=${code}`;
        return Response.json({ ...(await familyState(parent)), invite: { code, link, qr: await QRCode.toDataURL(link, { margin: 1, width: 240 }) } });
      }
      case "device-approve":
        await setDevice(parent, body.deviceId, true);
        break;
      case "device-remove":
        await setDevice(parent, body.deviceId, false);
        break;
      case "graduate-invite": {
        const code = await createInvite(parent, body.kidId, "graduate");
        return Response.json({ ...(await familyState(parent)), graduateLink: `${new URL(req.url).origin}/graduate/${code}` });
      }
      case "graduate-options":
        return Response.json(await approvalOptions(parent, "graduate", String(body.kidId)));
      case "graduate-check": {
        const { kid, wallet } = await checkGraduationApproval(parent, body.kidId, body.response as never);
        return Response.json({ ok: true, kidId: kid.id, chainKidId: kid.chain_kid_id, wallet });
      }
      case "graduate-confirm":
        await confirmGraduation(parent, body.kidId);
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
