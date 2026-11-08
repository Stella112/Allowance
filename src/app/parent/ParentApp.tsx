"use client";

import { CDPReactProvider } from "@coinbase/cdp-react";
import { AuthButton } from "@coinbase/cdp-react/components/AuthButton";
import { useGetAccessToken, useIsInitialized, useIsSignedIn, useSignOut } from "@coinbase/cdp-hooks";
import { startRegistration } from "@simplewebauthn/browser";
import Link from "next/link";
import Family from "./Family";
import { useCallback, useEffect, useState } from "react";

const PROJECT_ID = process.env.NEXT_PUBLIC_CDP_PROJECT_ID ?? "";

type Me = { parent: { email: string | null; wallet: string; vault: string | null; timezone: string }; hasPasskey: boolean };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? "Something went wrong. Please try again."), { status: res.status });
  return json as T;
}
const post = <T,>(path: string, body: unknown) => call<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export default function ParentApp() {
  if (!PROJECT_ID) {
    return (
      <Shell>
        <p role="alert">Parent sign-in isn&apos;t configured yet (missing NEXT_PUBLIC_CDP_PROJECT_ID).</p>
      </Shell>
    );
  }
  return (
    <CDPReactProvider config={{ projectId: PROJECT_ID, ethereum: { createOnLogin: "smart" }, appName: "Allowance", authMethods: ["email"] }}>
      <Shell>
        <ParentFlow />
      </Shell>
    </CDPReactProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pb-32 pt-5">
      {children}
    </main>
  );
}

function ParentFlow() {
  const { isInitialized } = useIsInitialized();
  const { isSignedIn } = useIsSignedIn();
  const { getAccessToken } = useGetAccessToken();
  const { signOut } = useSignOut();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMe(await call<Me>("/api/parent/session"));
    } catch (e) {
      if ((e as { status?: number }).status === 401) setMe(null);
      else setError((e as Error).message);
    }
  }, []);

  // When Coinbase says we're signed in but the server has no session yet, hand the token to the server to check.
  useEffect(() => {
    // Signed out: the sign-in button shows (render checks isSignedIn), so there's nothing to fetch.
    if (!isInitialized || !isSignedIn) return;
    (async () => {
      try {
        await call<Me>("/api/parent/session").then(setMe);
      } catch {
        setBusy("Checking your sign-in…");
        try {
          const accessToken = await getAccessToken();
          if (!accessToken) throw new Error("Please sign in again.");
          await post("/api/parent/session", { accessToken });
          await load();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(null);
        }
      }
    })();
  }, [isInitialized, isSignedIn, getAccessToken, load]);

  const setupPasskey = async () => {
    setError(null);
    setBusy("Waiting for Face ID or fingerprint…");
    try {
      const optionsJSON = await call<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/parent/passkey");
      const response = await startRegistration({ optionsJSON });
      await post("/api/parent/passkey", { response, label: navigator.platform || "This device" });
      await load();
    } catch (e) {
      setError((e as Error).name === "NotAllowedError" ? "Face ID was cancelled. Tap the button to try again." : (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const logOut = async () => {
    await call("/api/parent/session", { method: "DELETE" }).catch(() => {});
    await signOut().catch(() => {});
    setMe(null);
  };

  if (!isInitialized) return <p className="text-moon-dim">Loading…</p>;

  return (
    <>
      {me ? (
        <header className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sunny text-2xl" aria-hidden>
            🌙
          </span>
          <div className="flex-1">
            <p className="text-sm font-bold text-moon-dim">Good to see you</p>
            <h1 className="text-xl font-extrabold leading-tight">Your family</h1>
          </div>
          <button type="button" onClick={logOut} className="btn btn-sm btn-white shadow">
            Sign out
          </button>
        </header>
      ) : (
        <header className="mt-8">
          <Link href="/" className="text-sm font-extrabold text-moon-dim">
            ← Allowance
          </Link>
          <h1 className="screen-title mt-6">For parents</h1>
          <p className="mt-2 font-semibold text-moon-dim">Sign in with your email and a 6-digit code. No password, no seed phrase. A secure wallet is created for you on Base.</p>
        </header>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}
      {busy && (
        <p aria-live="polite" className="rounded-xl bg-night-800 px-3 py-2 text-sm">
          ⏳ {busy}
        </p>
      )}

      {!isSignedIn ? (
        <section className="card">
          <AuthButton />
        </section>
      ) : !me ? (
        // Signed in with Coinbase; our server is still checking the sign-in (or showed an error above).
        !error && (
          <p aria-live="polite" className="animate-pulse rounded-xl bg-night-800 px-3 py-2 text-sm">
            ⏳ Checking your sign-in…
          </p>
        )
      ) : !me.hasPasskey ? (
        <section className="card flex flex-col gap-3">
          <h2 className="section-title">Step 2: turn on Face ID or fingerprint</h2>
          <p className="text-moon-dim">
            Every approval asks for it, and we check it on our server. That way a kid up late on your phone can&apos;t approve their own pitch.
          </p>
          <button type="button" onClick={setupPasskey} disabled={!!busy} className="btn">
            Set up Face ID / fingerprint
          </button>
        </section>
      ) : (
        <>
          <Family />
          <p className="note break-all text-center">
            Signed in as {me.parent.email ?? "a parent"} ·{" "}
            <a className="underline" href={`https://basescan.org/address/${me.parent.wallet}`} target="_blank" rel="noreferrer">
              View wallet
            </a>
          </p>
        </>
      )}

      {isSignedIn && !me && (
        <button type="button" onClick={logOut} className="self-start text-sm underline">
          Sign out
        </button>
      )}
    </>
  );
}
