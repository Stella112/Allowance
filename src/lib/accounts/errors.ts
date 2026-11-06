/** An error whose message is safe to show to the user. */
export class AccountError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function toResponse(err: unknown) {
  if (err instanceof AccountError) return Response.json({ error: err.message }, { status: err.status });
  // Supabase errors are plain objects; log their fields so they don't print as "{}".
  console.error("[accounts] error:", err instanceof Error ? err : JSON.stringify(err));
  return Response.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
}
