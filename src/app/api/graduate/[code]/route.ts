import { toResponse } from "@/lib/accounts/errors";
import { claimGraduation } from "@/lib/accounts/graduation";

/** The kid (now 18) signs in with their own email; the server checks the token and their wallet. */
export async function POST(req: Request, ctx: RouteContext<"/api/graduate/[code]">) {
  try {
    const { code } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { accessToken?: unknown };
    return Response.json(await claimGraduation(code, body.accessToken));
  } catch (err) {
    return toResponse(err);
  }
}
