"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Status = { status: "none" | "pending" | "approved" | "removed"; label?: string; kid?: { nickname: string; avatar: string } | null };

async function joinApi(body?: unknown): Promise<Status> {
  const res = await fetch(
    "/api/join",
    body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
  return json;
}

/** A kid's own device (tablet, school phone) joins the family with a code, a link or a QR code. */
export default function JoinApp() {
  const params = useSearchParams();
  const router = useRouter();
  const [s, setS] = useState<Status | null>(null);
  const [code, setCode] = useState((params.get("code") ?? "").toUpperCase());
  const [label, setLabel] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    joinApi().then(setS).catch((e) => setError(e.message));
  }, []);

  // While waiting for the parent, check every few seconds.
  useEffect(() => {
    if (s?.status !== "pending") return;
    const t = setInterval(() => joinApi().then(setS).catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [s?.status]);

  const act = async (body: unknown, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      setS(await joinApi(body));
      after?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-10">
      <p className="text-5xl" aria-hidden>
        {s?.kid?.avatar ?? "🌙"}
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}
      {!s ? (
        <p className="text-moon-dim">Loading…</p>
      ) : s.status === "none" ? (
        <form
          className="flex flex-col gap-3 card"
          onSubmit={(e) => {
            e.preventDefault();
            act({ action: "join", code, label });
          }}
        >
          <h1 className="text-2xl font-bold">Join your family on Allowance</h1>
          <label className="flex flex-col gap-1">
            Family code from your parent
            <input
              value={code}
              maxLength={6}
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              className="rounded-xl bg-white p-3 text-center text-2xl tracking-[0.3em] text-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            Name this device
            <input value={label} maxLength={40} placeholder="My tablet" onChange={(e) => setLabel(e.target.value)} className="field" />
          </label>
          <button type="submit" disabled={busy || code.length !== 6} className="btn">
            Ask to join
          </button>
        </form>
      ) : s.status === "pending" ? (
        <section className="card">
          <h1 className="text-xl font-bold">Waiting for your parent…</h1>
          <p className="mt-2 text-moon-dim">
            They&apos;ll see “{s.kid?.nickname}&apos;s {s.label} wants to join. Approve?” This page updates by itself.
          </p>
        </section>
      ) : s.status === "approved" ? (
        <form
          className="flex flex-col gap-3 card"
          onSubmit={(e) => {
            e.preventDefault();
            act({ action: "pin", pin }, () => router.push("/kid"));
          }}
        >
          <h1 className="text-xl font-bold">Hi {s.kid?.nickname}! Enter your PIN</h1>
          <label className="sr-only" htmlFor="pin">
            Your PIN
          </label>
          <input
            id="pin"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="w-32 rounded-xl bg-white p-3 text-center text-2xl tracking-widest text-ink"
          />
          <button type="submit" disabled={busy || pin.length !== 4} className="btn">
            Open Allowance
          </button>
        </form>
      ) : (
        <p className="card">Your parent removed this device. Ask them for a new family code.</p>
      )}
    </main>
  );
}
