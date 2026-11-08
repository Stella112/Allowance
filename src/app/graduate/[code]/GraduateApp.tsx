"use client";

import { CDPReactProvider } from "@coinbase/cdp-react";
import { AuthButton } from "@coinbase/cdp-react/components/AuthButton";
import { useGetAccessToken, useIsInitialized, useIsSignedIn } from "@coinbase/cdp-hooks";
import { useState } from "react";

const PROJECT_ID = process.env.NEXT_PUBLIC_CDP_PROJECT_ID ?? "";

/** At 18: the kid signs up with their own email, gets their own wallet, and hands it to graduation. */
export default function GraduateApp({ code }: { code: string }) {
  return (
    <CDPReactProvider config={{ projectId: PROJECT_ID, ethereum: { createOnLogin: "smart" }, appName: "Allowance", authMethods: ["email"] }}>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-10">
        <p className="text-5xl" aria-hidden>
          🎓
        </p>
        <h1 className="text-2xl font-bold">Graduation day</h1>
        <p className="text-moon-dim">
          Sign up with your own email. You get your own wallet on Base, and your parent moves every share you own into it. Your history comes with you.
        </p>
        <Claim code={code} />
      </main>
    </CDPReactProvider>
  );
}

function Claim({ code }: { code: string }) {
  const { isInitialized } = useIsInitialized();
  const { isSignedIn } = useIsSignedIn();
  const { getAccessToken } = useGetAccessToken();
  const [done, setDone] = useState<{ nickname: string; wallet: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const claim = async () => {
    setBusy(true);
    setError(null);
    try {
      const accessToken = await getAccessToken();
      const res = await fetch(`/api/graduate/${code}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accessToken }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      setDone(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!isInitialized) return <p className="text-moon-dim">Loading…</p>;
  if (done)
    return (
      <section className="rounded-2xl bg-sunrise-100 p-5 text-ink">
        <p className="font-semibold">Your wallet is ready, {done.nickname}! 🎉</p>
        <p className="mt-1 break-all text-sm">{done.wallet}</p>
        <p className="mt-2 text-sm">Ask your parent to open Allowance and tap Graduate. They&apos;ll confirm with Face ID.</p>
      </section>
    );
  return (
    <section className="flex flex-col gap-3 card">
      {error && (
        <p role="alert" className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}
      {!isSignedIn ? (
        <AuthButton />
      ) : (
        <button type="button" disabled={busy} onClick={claim} className="btn">
          {busy ? "Checking…" : "Use my new wallet for graduation"}
        </button>
      )}
    </section>
  );
}
