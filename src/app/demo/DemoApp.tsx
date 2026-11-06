"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

// ------------------------------------------------------------------ types (mirror the API)

type Ticker = "AAPL" | "NVDA";
type Ev = {
  id: number;
  kind: "allowance" | "pitch" | "gift" | "thank_you";
  status: "pending" | "queued" | "sending" | "confirmed" | "failed" | "rejected";
  ticker: Ticker | null;
  usdc_micro: number;
  tokens_raw: string | null;
  why: string | null;
  gifter_name: string | null;
  occasion: string | null;
  message: string | null;
  ref_event_id: number | null;
  txUrl: string | null;
  created_at: string;
};
type State = {
  session: { id: string; virtualNow: string; morning: boolean };
  events: Ev[];
  holdings: { usdcMicro: string; stocks: { ticker: Ticker; raw: string; shares: number }[] } | null;
};
type ReplayItem = { kind: string; company: string | null; usdc_micro: number; tokens_raw: string | null; gifter_name: string | null; txUrl: string; executed_at: string };
type Card = { whatItDoes: string; howItMakesMoney: string; oneThingToWatch: string };
type Role = "kid" | "parent" | "relative";

const COMPANIES: Record<Ticker, { name: string; emoji: string }> = {
  AAPL: { name: "Apple", emoji: "🍎" },
  NVDA: { name: "Nvidia", emoji: "🎮" },
};
const OCCASIONS = ["Birthday", "Good grades", "Christmas", "Eid", "Graduation"];

const usd = (micro: number | string) => `$${(Number(micro) / 1e6).toFixed(2)}`;
const shares = (raw: string | null) => (raw ? (Number(raw) / 1e8).toFixed(7).replace(/0+$/, "") : "0");
const clock = (iso: string, offsetH: number) => {
  const d = new Date(new Date(iso).getTime() + offsetH * 3600_000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  return `${((h + 11) % 12) + 1}:${m}${h < 12 ? "am" : "pm"}`;
};

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/demo/${path}`, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json as T;
}

// ------------------------------------------------------------------ app

export default function DemoApp() {
  const [state, setState] = useState<State | null>(null);
  const [replay, setReplay] = useState<ReplayItem[] | null>(null);
  const [role, setRole] = useState<Role>("kid");
  const [kidUnlocked, setKidUnlocked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nightShift, setNightShift] = useState(false);

  useEffect(() => {
    api<State>("state").then(setState).catch(() => setState(null));
  }, []);

  // While a transaction is still landing (e.g. Tobi's first allowance), refresh every 3 seconds.
  const landing = !!state?.events.some((e) => e.status === "sending");
  useEffect(() => {
    if (!landing || busy) return;
    const t = setInterval(() => {
      api<State>("state").then(setState).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [landing, busy]);

  const run = useCallback(async (label: string, fn: () => Promise<{ state?: State; replay?: boolean }>) => {
    setBusy(label);
    setError(null);
    try {
      const out = await fn();
      if (out.replay) {
        const r = await api<{ replay: ReplayItem[] }>("replay");
        setReplay(r.replay);
      }
      if (out.state) setState(out.state);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const start = () =>
    run("Setting up a fresh Tobi on Base…", async () => {
      setKidUnlocked(false);
      setRole("kid");
      return api("start", {});
    });

  const skip = () =>
    run("The night shift is working…", async () => {
      setNightShift(true);
      const minAnim = new Promise((r) => setTimeout(r, 2500));
      try {
        const [out] = await Promise.all([api<{ state: State }>("skip-to-morning", {}), minAnim]);
        setRole("kid");
        return out;
      } finally {
        setNightShift(false);
      }
    });

  if (replay) return <Replay items={replay} />;
  if (!state) return <Welcome onStart={start} busy={busy} error={error} />;

  const morning = state.session.morning;
  const queuedGift = state.events.find((e) => e.kind === "gift" && e.status === "queued");

  return (
    <div className={`min-h-full flex-1 transition-colors duration-700 ${morning ? "bg-sunrise-50 text-ink" : "bg-night-950 text-moon"}`}>
      {nightShift && <NightShift />}
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-24 pt-5">
        <header className="flex items-center justify-between gap-2">
          <Link href="/" className="text-sm font-semibold">
            ← Allowance
          </Link>
          <p className={`text-sm ${morning ? "text-sunrise-700" : "text-moon-dim"}`}>
            Lagos · {clock(state.session.virtualNow, 1)} {morning ? "☀️" : "🌙"}
          </p>
        </header>
        <p className={`rounded-xl px-3 py-2 text-xs ${morning ? "bg-sunrise-100" : "bg-night-900 text-moon-dim"}`}>
          Demo family, real Base transactions, tiny amounts paid by Allowance.
        </p>

        <StepGuide state={state} role={role} onGo={(r) => setRole(r)} onSkip={skip} busy={!!busy} />

        <RoleSwitcher role={role} morning={morning} onPick={(r) => setRole(r)} />

        {error && (
          <p role="alert" className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900">
            {error}
          </p>
        )}
        {busy && !nightShift && (
          <p aria-live="polite" className={`rounded-xl px-3 py-2 text-sm ${morning ? "bg-sunrise-100" : "bg-night-800"}`}>
            ⏳ {busy}
          </p>
        )}

        {role === "kid" &&
          (kidUnlocked ? (
            morning ? (
              <MorningReport state={state} busy={!!busy} onThank={(giftId, text) => run("Sending your thank-you…", () => api("thank-you", { giftId, text }))} />
            ) : (
              <KidNight state={state} busy={!!busy} onPitch={(p) => run("Sending your pitch to Mum…", () => api("pitch", p))} />
            )
          ) : (
            <PinPad morning={morning} onUnlock={() => setKidUnlocked(true)} />
          ))}
        {role === "parent" && (
          <ParentView state={state} busy={!!busy} onApprove={(eventId) => run("Buying real shares on Base…", () => api("approve", { eventId }))} />
        )}
        {role === "relative" && (
          <RelativeView state={state} busy={!!busy} onGift={(g) => run("Wrapping your gift…", () => api("gift", g))} />
        )}

        <div className="mt-2 flex flex-col gap-2">
          {!morning && (
            <button
              type="button"
              onClick={skip}
              disabled={!!busy}
              className="rounded-2xl bg-star px-6 py-4 text-lg font-semibold text-night-950 hover:bg-sunrise-300 disabled:opacity-60"
            >
              🌅 Skip to morning{queuedGift ? " (1 gift waiting)" : ""}
            </button>
          )}
          {!morning && !queuedGift && <p className="text-center text-sm text-moon-dim">Tip: send Aunty Funmi&apos;s gift first, so Tobi wakes up to it.</p>}
          <button type="button" onClick={start} disabled={!!busy} className="text-sm underline disabled:opacity-60">
            Reset demo
          </button>
        </div>
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function StepGuide({ state, role, onGo, onSkip, busy }: { state: State; role: Role; onGo: (r: Role) => void; onSkip: () => void; busy: boolean }) {
  const ev = state.events;
  const morning = state.session.morning;
  const pitch = ev.find((e) => e.kind === "pitch" && e.status !== "failed");
  const steps: { label: string; done: boolean; role?: Role; who?: string }[] = [
    { label: "Tobi pitches a company at bedtime", done: !!pitch, role: "kid", who: "Tobi" },
    { label: "Aunty Funmi sends a gift from London", done: ev.some((e) => e.kind === "gift"), role: "relative", who: "Aunty Funmi" },
    { label: "Skip to morning", done: morning },
    { label: "Mum approves the pitch at breakfast", done: pitch?.status === "confirmed", role: "parent", who: "Mum" },
    { label: "Tobi reads his Morning Report and says thanks", done: ev.some((e) => e.kind === "thank_you"), role: "kid", who: "Tobi" },
  ];
  // Night steps can't be done after morning; skip them when choosing what's next.
  const next = steps.findIndex((s, i) => !s.done && !(morning && i < 3));
  return (
    <ol aria-label="Demo steps" className={`flex flex-col gap-1 rounded-2xl p-3 text-sm ${morning ? "bg-white" : "bg-night-900"}`}>
      {steps.map((s, i) => {
        const missed = morning && i < 2 && !s.done;
        const isNext = i === next;
        return (
          <li key={s.label} className={`flex items-center justify-between gap-2 rounded-xl px-2 py-1 ${isNext ? (morning ? "bg-sunrise-100" : "bg-night-700") : ""}`}>
            <span className={s.done ? "line-through opacity-60" : missed ? "opacity-50" : ""}>
              {s.done ? "✅" : i < 3 ? "🌙" : "☀️"} {i + 1}. {s.label}
              {missed ? " (missed — Reset demo to try)" : ""}
            </span>
            {isNext && s.role && s.role !== role && (
              <button type="button" onClick={() => onGo(s.role!)} className="shrink-0 rounded-lg bg-star px-3 py-1 font-semibold text-night-950">
                Go to {s.who}
              </button>
            )}
            {isNext && !s.role && (
              <button type="button" disabled={busy} onClick={onSkip} className="shrink-0 rounded-lg bg-star px-3 py-1 font-semibold text-night-950 disabled:opacity-60">
                Skip
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Welcome({ onStart, busy, error }: { onStart: () => void; busy: string | null; error: string | null }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-5 px-4 py-10">
      <p className="text-5xl" aria-hidden>
        🌙
      </p>
      <h1 className="text-3xl font-bold">Meet the Adeyemi family</h1>
      <p className="text-moon-dim">
        Tobi (11) lives in Lagos. Mum approves his pitches. Aunty Funmi lives in London. In about 2 minutes you&apos;ll play all three and watch a night shift
        happen with real transactions on Base.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-moon-dim">
        <li>As Tobi, pitch a company to Mum.</li>
        <li>As Mum, approve it. Real shares are bought.</li>
        <li>As Aunty Funmi, send a gift while Tobi sleeps.</li>
        <li>Skip to morning and read Tobi&apos;s Morning Report.</li>
      </ol>
      {error && (
        <p role="alert" className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      )}
      <button type="button" onClick={onStart} disabled={!!busy} className="rounded-2xl bg-star px-6 py-4 text-lg font-semibold text-night-950 disabled:opacity-60">
        {busy ?? "Start the demo"}
      </button>
      <p className="text-xs text-moon-dim">Demo family, real Base transactions, tiny amounts (a few cents) paid by Allowance. No wallet or sign-up needed.</p>
    </main>
  );
}

function RoleSwitcher({ role, morning, onPick }: { role: Role; morning: boolean; onPick: (r: Role) => void }) {
  const roles: { id: Role; name: string; face: string; sub: string }[] = [
    { id: "kid", name: "Tobi", face: "👦🏾", sub: "11, Lagos" },
    { id: "parent", name: "Mum", face: "👩🏾", sub: "Lagos" },
    { id: "relative", name: "Aunty Funmi", face: "👩🏾‍🦱", sub: "London" },
  ];
  return (
    <nav aria-label="Switch person" className="grid grid-cols-3 gap-2">
      {roles.map((r) => {
        const active = r.id === role;
        return (
          <button
            key={r.id}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(r.id)}
            className={`flex flex-col items-center rounded-2xl p-3 ${
              active ? (morning ? "bg-sunrise-300 text-ink" : "bg-night-700") : morning ? "bg-sunrise-100" : "bg-night-900"
            }`}
          >
            <span className="text-3xl" aria-hidden>
              {r.face}
            </span>
            <span className="mt-1 text-sm font-semibold">{r.name}</span>
            <span className="text-xs opacity-70">{r.sub}</span>
          </button>
        );
      })}
    </nav>
  );
}

function PinPad({ morning, onUnlock }: { morning: boolean; onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  return (
    <section className={`rounded-2xl p-5 ${morning ? "bg-sunrise-100" : "bg-night-900"}`}>
      <h2 className="text-lg font-semibold">Switch to Tobi</h2>
      <p className="text-sm opacity-80">Demo PIN: 1234</p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (pin === "1234") onUnlock();
          else setWrong(true);
        }}
      >
        <label className="sr-only" htmlFor="pin">
          Tobi&apos;s PIN
        </label>
        <input
          id="pin"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ""));
            setWrong(false);
          }}
          className="w-32 rounded-xl border border-night-700 bg-white px-3 py-2 text-center text-2xl tracking-widest text-ink"
        />
        <button type="submit" className="rounded-xl bg-star px-4 font-semibold text-night-950">
          Go
        </button>
      </form>
      {wrong && <p className="mt-2 text-sm">That&apos;s not it. Try 1234.</p>}
    </section>
  );
}

function KidNight({ state, busy, onPitch }: { state: State; busy: boolean; onPitch: (p: { ticker: Ticker; why: string }) => void }) {
  const [pick, setPick] = useState<Ticker | null>(null);
  const [why, setWhy] = useState("");
  const [cards, setCards] = useState<Partial<Record<Ticker, Card & { source?: string }>>>({});
  const card = pick ? cards[pick] ?? null : null;
  const pitch = state.events.find((e) => e.kind === "pitch" && e.status !== "failed");

  useEffect(() => {
    if (!pick || cards[pick]) return;
    fetch(`/api/ai/explain?ticker=${pick}&band=10-13`)
      .then((r) => r.json())
      .then((j) => j.card && setCards((c) => ({ ...c, [pick]: { ...j.card, source: j.source } })))
      .catch(() => {});
  }, [pick, cards]);

  return (
    <section className="flex flex-col gap-4">
      <Savings state={state} />
      {pitch ? (
        <div className="rounded-2xl bg-night-900 p-5">
          <p className="text-lg font-semibold">
            {pitch.status === "pending" ? "🌙 Pitch sent! Mum will see this in the morning." : pitch.status === "confirmed" ? `🎉 Mum said yes! You own a piece of ${COMPANIES[pitch.ticker!].name}.` : "Your pitch is being handled…"}
          </p>
          <p className="mt-2 text-moon-dim">“{pitch.why}”</p>
          {pitch.txUrl && <TxLink href={pitch.txUrl} />}
        </div>
      ) : (
        <div className="rounded-2xl bg-night-900 p-5">
          <h2 className="text-lg font-semibold">Pitch a company to Mum</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(Object.keys(COMPANIES) as Ticker[]).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={pick === t}
                onClick={() => setPick(t)}
                className={`rounded-xl p-4 text-left ${pick === t ? "bg-night-700 ring-2 ring-star" : "bg-night-800"}`}
              >
                <span className="text-2xl" aria-hidden>
                  {COMPANIES[t].emoji}
                </span>
                <span className="ml-2 font-semibold">{COMPANIES[t].name}</span>
              </button>
            ))}
          </div>
          {pick && (
            <div className="mt-4 rounded-xl bg-night-800 p-4 text-sm">
              {card ? (
                <dl className="space-y-2">
                  <div>
                    <dt className="font-semibold text-star">What it does</dt>
                    <dd>{card.whatItDoes}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-star">How it makes money</dt>
                    <dd>{card.howItMakesMoney}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-star">One thing to watch</dt>
                    <dd>{card.oneThingToWatch}</dd>
                  </div>
                  <p className="pt-1 text-xs text-moon-dim">
                    {card.source === "ai" ? "Written live by Claude (AI) for ages 10–13." : "Written with Claude (AI) while building Allowance, for ages 10–13."} Learning only,
                    not financial advice.
                  </p>
                </dl>
              ) : (
                <p className="text-moon-dim">Reading about {COMPANIES[pick].name}…</p>
              )}
            </div>
          )}
          {pick && (
            <form
              className="mt-4 flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onPitch({ ticker: pick, why });
              }}
            >
              <label htmlFor="why" className="font-semibold">
                Why do you like {COMPANIES[pick].name}?
              </label>
              <textarea
                id="why"
                maxLength={280}
                rows={3}
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                placeholder={pick === "AAPL" ? "Everyone in my class wants AirPods…" : "Their chips make my games look amazing…"}
                className="rounded-xl bg-white p-3 text-ink"
              />
              <p className="text-right text-xs text-moon-dim">{why.length}/280</p>
              <button type="submit" disabled={busy || !why.trim()} className="rounded-xl bg-star px-4 py-3 font-semibold text-night-950 disabled:opacity-60">
                Send pitch to Mum ($0.01)
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function Savings({ state }: { state: State }) {
  const h = state.holdings;
  return (
    <div className={`rounded-2xl p-4 ${state.session.morning ? "bg-white" : "bg-night-900"}`}>
      <p className="text-sm opacity-80">Tobi&apos;s savings (read live from Base)</p>
      <p className="text-3xl font-bold">{h ? usd(h.usdcMicro) : "…"}</p>
      {state.events.some((e) => e.kind === "allowance" && e.status === "sending") && (
        <p className="text-sm opacity-80">⏳ An allowance is landing on Base right now…</p>
      )}
      {h && h.stocks.some((s) => s.raw !== "0") && (
        <ul className="mt-2 space-y-1 text-sm">
          {h.stocks
            .filter((s) => s.raw !== "0")
            .map((s) => (
              <li key={s.ticker}>
                {COMPANIES[s.ticker].emoji} {s.shares.toFixed(7).replace(/0+$/, "")} shares of {COMPANIES[s.ticker].name}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function ParentView({ state, busy, onApprove }: { state: State; busy: boolean; onApprove: (id: number) => void }) {
  const pitches = state.events.filter((e) => e.kind === "pitch");
  const morning = state.session.morning;
  return (
    <section className={`flex flex-col gap-3 rounded-2xl p-5 ${morning ? "bg-white" : "bg-night-900"}`}>
      <h2 className="text-lg font-semibold">Mum&apos;s inbox</h2>
      {pitches.length === 0 && <p className="opacity-80">No pitches yet. Switch to Tobi and send one.</p>}
      {pitches.map((p) => (
        <article key={p.id} className={`rounded-xl p-4 ${morning ? "bg-sunrise-50" : "bg-night-800"}`}>
          <p className="font-semibold">
            Tobi wants to buy {usd(p.usdc_micro)} of {COMPANIES[p.ticker!].name} {COMPANIES[p.ticker!].emoji}
          </p>
          <p className="mt-1 opacity-90">“{p.why}”</p>
          {p.status === "pending" && (
            <>
              <p className="mt-3 text-xs opacity-80">
                Approving buys {usd(p.usdc_micro)} of a real Coinbase tokenized {COMPANIES[p.ticker!].name} share on Base, paid from Tobi&apos;s savings, held in your family
                vault.
              </p>
              <button type="button" disabled={busy} onClick={() => onApprove(p.id)} className="mt-3 w-full rounded-xl bg-star px-4 py-3 font-semibold text-night-950 disabled:opacity-60">
                ✅ Approve (Demo approval)
              </button>
              <p className="mt-1 text-xs opacity-70">In the real app this step asks for Face ID or your fingerprint.</p>
            </>
          )}
          {p.status === "confirmed" && <p className="mt-2 text-sm">Approved. Tobi now owns {shares(p.tokens_raw)} shares.</p>}
          {p.status === "failed" && <p className="mt-2 text-sm">That buy didn&apos;t go through, and no money moved.</p>}
          {p.txUrl && <TxLink href={p.txUrl} />}
        </article>
      ))}
    </section>
  );
}

function RelativeView({ state, busy, onGift }: { state: State; busy: boolean; onGift: (g: { ticker: Ticker; occasion: string; message: string }) => void }) {
  const [ticker, setTicker] = useState<Ticker>("AAPL");
  const [occasion, setOccasion] = useState(OCCASIONS[1]);
  const [message, setMessage] = useState("Well done on your test, Tobi!");
  const gift = state.events.find((e) => e.kind === "gift" && e.status !== "failed");
  const thanks = state.events.filter((e) => e.kind === "thank_you");
  const morning = state.session.morning;
  const now = state.session.virtualNow;

  return (
    <section className={`flex flex-col gap-3 rounded-2xl p-5 ${morning ? "bg-white" : "bg-night-900"}`}>
      <div className={`grid grid-cols-2 gap-2 rounded-xl p-3 text-center ${morning ? "bg-sunrise-50" : "bg-night-800"}`}>
        <div>
          <p className="text-xs opacity-70">London</p>
          <p className="text-2xl font-bold">{clock(now, 0)}</p>
        </div>
        <div>
          <p className="text-xs opacity-70">Lagos</p>
          <p className="text-2xl font-bold">{clock(now, 1)}</p>
        </div>
      </div>
      {!morning && <p className="text-center">It&apos;s {clock(now, 1)} in Lagos. Tobi will wake up to your gift. 🌙</p>}

      {thanks.map((t) => (
        <p key={t.id} className="rounded-xl bg-sunrise-100 p-3 text-ink">
          💌 Tobi says: “{t.message}”
        </p>
      ))}

      {gift ? (
        <div className={`rounded-xl p-4 ${morning ? "bg-sunrise-50" : "bg-night-800"}`}>
          <p className="font-semibold">
            🎁 {gift.occasion} gift: {usd(gift.usdc_micro)} of {COMPANIES[gift.ticker!].name}
          </p>
          <p className="text-sm opacity-80">
            {gift.status === "queued" ? "Queued for the night shift. Tap Skip to morning." : gift.status === "confirmed" ? "Delivered while Tobi slept." : "On its way…"}
          </p>
          {gift.txUrl && <TxLink href={gift.txUrl} />}
        </div>
      ) : morning ? (
        <p className="opacity-80">No gift was sent last night.</p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onGift({ ticker, occasion, message });
          }}
        >
          <fieldset>
            <legend className="font-semibold">Gift a slice of</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(Object.keys(COMPANIES) as Ticker[]).map((t) => (
                <button key={t} type="button" aria-pressed={ticker === t} onClick={() => setTicker(t)} className={`rounded-xl p-3 ${ticker === t ? "bg-night-700 ring-2 ring-star" : "bg-night-800"}`}>
                  {COMPANIES[t].emoji} {COMPANIES[t].name}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Occasion</span>
            <select value={occasion} onChange={(e) => setOccasion(e.target.value)} className="rounded-xl bg-white p-3 text-ink">
              {OCCASIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Message</span>
            <input value={message} maxLength={200} onChange={(e) => setMessage(e.target.value)} className="rounded-xl bg-white p-3 text-ink" />
          </label>
          <div className="rounded-xl bg-night-800 p-3 text-xs text-moon-dim">
            <p>Amount: $0.02 USDC · Network: Base</p>
            <p>Tobi gets: a slice of a real Coinbase tokenized {COMPANIES[ticker].name} share</p>
            <p>Goes to: the Adeyemi family vault (demo; Allowance pays)</p>
          </div>
          <button type="submit" disabled={busy} className="rounded-xl bg-star px-4 py-3 font-semibold text-night-950 disabled:opacity-60">
            🎁 Send gift
          </button>
        </form>
      )}
    </section>
  );
}

function MorningReport({ state, busy, onThank }: { state: State; busy: boolean; onThank: (giftId: number, text: string) => void }) {
  const [text, setText] = useState("Thank you Aunty Funmi! I love it 🧡");
  const gifts = state.events.filter((e) => e.kind === "gift");
  const pitches = state.events.filter((e) => e.kind === "pitch" && e.status === "confirmed");
  const waiting = state.events.find((e) => e.kind === "pitch" && (e.status === "pending" || e.status === "sending"));
  const allowance = [...state.events].reverse().find((e) => e.kind === "allowance" && e.status === "confirmed");
  const thanked = new Set(state.events.filter((e) => e.kind === "thank_you").map((e) => e.ref_event_id));

  return (
    <section className="flex flex-col gap-3">
      <div className="rounded-2xl bg-gradient-to-b from-sunrise-300 to-sunrise-100 p-5 text-ink">
        <p className="text-sm font-semibold uppercase tracking-wide">Good morning, Tobi ☀️</p>
        <h2 className="mt-1 text-2xl font-bold">Your Morning Report</h2>
        <p className="text-sm">Here&apos;s what arrived while you slept.</p>
      </div>

      {gifts.map((g) => (
        <article key={g.id} className="rounded-2xl bg-white p-4">
          {g.status === "confirmed" ? (
            <>
              <p className="text-lg font-semibold">
                🎁 Aunty Funmi sent you a slice of {COMPANIES[g.ticker!].name} while you slept.
              </p>
              <p className="text-sm opacity-80">
                {g.occasion}: “{g.message}” · {shares(g.tokens_raw)} shares
              </p>
              {g.txUrl && <TxLink href={g.txUrl} />}
              {!thanked.has(g.id) ? (
                <form
                  className="mt-3 flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onThank(g.id, text);
                  }}
                >
                  <label htmlFor={`ty-${g.id}`} className="text-sm font-semibold">
                    Send a thank-you to London
                  </label>
                  <input id={`ty-${g.id}`} value={text} maxLength={280} onChange={(e) => setText(e.target.value)} className="rounded-xl border border-sunrise-300 p-3" />
                  <button type="submit" disabled={busy} className="rounded-xl bg-sunrise-500 px-4 py-3 font-semibold text-white disabled:opacity-60">
                    💌 Send thank-you
                  </button>
                </form>
              ) : (
                <p className="mt-2 text-sm">💌 Thank-you sent. Aunty Funmi will see it when she wakes up.</p>
              )}
            </>
          ) : (
            <p>Aunty Funmi&apos;s gift couldn&apos;t be delivered this time, and no money moved.</p>
          )}
        </article>
      ))}

      {pitches.map((p) => (
        <article key={p.id} className="rounded-2xl bg-white p-4">
          <p className="text-lg font-semibold">✅ Mum approved your {COMPANIES[p.ticker!].name} pitch!</p>
          <p className="text-sm opacity-80">You own {shares(p.tokens_raw)} shares of {COMPANIES[p.ticker!].name}.</p>
          {p.txUrl && <TxLink href={p.txUrl} />}
        </article>
      ))}

      {waiting && (
        <article className="rounded-2xl bg-white p-4">
          <p className="text-lg font-semibold">🕒 Your {COMPANIES[waiting.ticker!].name} pitch is waiting for Mum.</p>
          <p className="text-sm opacity-80">She&apos;ll see it at breakfast. (Switch to Mum to approve it.)</p>
        </article>
      )}

      {allowance && (
        <article className="rounded-2xl bg-white p-4">
          <p className="text-lg font-semibold">🌙 Your allowance landed at midnight: {usd(allowance.usdc_micro)}</p>
          {allowance.txUrl && <TxLink href={allowance.txUrl} />}
        </article>
      )}

      {gifts.length === 0 && pitches.length === 0 && <p className="rounded-2xl bg-white p-4">A quiet night. Your allowance still landed!</p>}

      <Savings state={state} />
      <p className="text-xs opacity-70">Shares are real Coinbase tokenized stocks on Base, held in your family vault. Learning only, not financial advice.</p>
    </section>
  );
}

function TxLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold underline">
      See it on Basescan ↗
    </a>
  );
}

function NightShift() {
  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-night-950 text-moon">
      <p className="animate-pulse text-6xl" aria-hidden>
        🌙 ✨ ☀️
      </p>
      <p className="mt-6 text-xl font-semibold">The night shift is working…</p>
      <p className="mt-2 max-w-xs text-center text-moon-dim">Delivering gifts and the midnight allowance with real transactions on Base.</p>
    </div>
  );
}

function Replay({ items }: { items: ReplayItem[] }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold">Today&apos;s live demo budget is used up</h1>
      <p className="text-moon-dim">
        Allowance pays for every demo transaction, and we keep it to a few cents a day. Here are the most recent real demo transactions instead.
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.txUrl} className="rounded-2xl bg-night-900 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-star">Replay of a real transaction</p>
            <p className="mt-1">
              {i.kind === "gift"
                ? `🎁 ${i.gifter_name ?? "A relative"} gifted ${usd(i.usdc_micro)} of ${i.company}`
                : i.kind === "pitch"
                  ? `✅ A pitch was approved: ${usd(i.usdc_micro)} of ${i.company}`
                  : `🌙 An allowance of ${usd(i.usdc_micro)} landed`}
            </p>
            <TxLink href={i.txUrl} />
          </li>
        ))}
      </ul>
      <Link href="/" className="underline">
        Back to Allowance
      </Link>
    </main>
  );
}
