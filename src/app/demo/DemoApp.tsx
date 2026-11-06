"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

// ------------------------------------------------------------------ types (mirror the API)

type Ticker = "AAPL" | "NVDA";
type Ev = {
  id: number;
  kind: "allowance" | "pitch" | "gift" | "thank_you" | "group_gift" | "contribution" | "graduation";
  status: "pending" | "queued" | "sending" | "confirmed" | "failed" | "rejected" | "refunded";
  ticker: Ticker | null;
  usdc_micro: number;
  tokens_raw: string | null;
  why: string | null;
  gifter_name: string | null;
  occasion: string | null;
  message: string | null;
  ref_event_id: number | null;
  coach_q: string | null;
  coach_a: string | null;
  match_micro: number;
  match_pct: number;
  txUrl: string | null;
  voiceUrl: string | null;
  created_at: string;
};
type State = {
  session: { id: string; virtualNow: string; morning: boolean };
  events: Ev[];
  holdings: { usdcMicro: string; stocks: { ticker: Ticker; raw: string; shares: number }[] } | null;
  scores: { eventId: number; ticker: Ticker; changePct: number }[];
  dividends: { ticker: Ticker; extraShares: number }[];
};
type Band = "6-9" | "10-13" | "14-17";
const BANDS: { id: Band; label: string }[] = [
  { id: "6-9", label: "6–9" },
  { id: "10-13", label: "10–13" },
  { id: "14-17", label: "14–17" },
];
const TOBI_BAND: Band = "10-13"; // Tobi is 11
type ReplayItem = { kind: string; company: string | null; usdc_micro: number; tokens_raw: string | null; gifter_name: string | null; txUrl: string; executed_at: string };
type Card = { whatItDoes: string; howItMakesMoney: string; oneThingToWatch: string };
type Role = "kid" | "parent" | "relative";

const COMPANIES: Record<Ticker, { name: string; emoji: string }> = {
  AAPL: { name: "Apple", emoji: "🍎" },
  NVDA: { name: "Nvidia", emoji: "🎮" },
};
const OCCASIONS = ["Birthday", "Good grades", "Christmas", "Eid", "Graduation"];

// Whole cents show 2 decimals; smaller amounts (like a half-cent match) show 3, so nothing is rounded up.
const usd = (micro: number | string) => {
  const n = Number(micro);
  return `$${(n / 1e6).toFixed(n % 10_000 === 0 ? 2 : 3)}`;
};
const shares = (raw: string | null) => (raw ? (Number(raw) / 1e8).toFixed(7).replace(/0+$/, "") : "0");
const clock = (iso: string, offsetH: number) => {
  const d = new Date(new Date(iso).getTime() + offsetH * 3600_000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  return `${((h + 11) % 12) + 1}:${m}${h < 12 ? "am" : "pm"}`;
};

async function api<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit =
    body === undefined
      ? { cache: "no-store" }
      : body instanceof FormData
        ? { method: "POST", body }
        : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const res = await fetch(`/api/demo/${path}`, init);
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

  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api<State>("state")
      .then(setState)
      .catch(() => setState(null))
      .finally(() => setLoaded(true));
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
  if (!loaded && !state)
    return (
      <main className="flex flex-1 items-center justify-center p-10" aria-busy="true">
        <p className="animate-pulse text-moon-dim">🌙 Waking up the Adeyemi family…</p>
      </main>
    );
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
              <MorningReport
                state={state}
                busy={!!busy}
                onThank={(giftId, text, voice) =>
                  run("Sending your thank-you…", () => {
                    if (!voice) return api("thank-you", { giftId, text });
                    const form = new FormData();
                    form.set("giftId", String(giftId));
                    form.set("text", text);
                    form.set("voice", voice, "thank-you");
                    return api("thank-you", form);
                  })
                }
              />
            ) : (
              <KidNight state={state} busy={!!busy} onPitch={(p) => run("Sending your pitch to Mum…", () => api("pitch", p))} />
            )
          ) : (
            <PinPad morning={morning} onUnlock={() => setKidUnlocked(true)} />
          ))}
        {role === "parent" && (
          <ParentView
            state={state}
            busy={!!busy}
            onApprove={(eventId, matchPct) => run("Buying real shares on Base…", () => api("approve", { eventId, matchPct }))}
            onGraduate={() => run("Moving Tobi's shares to his own wallet on Base…", () => api("graduate", {}))}
          />
        )}
        {role === "relative" && (
          <RelativeView
            state={state}
            busy={!!busy}
            onGift={(g) => run("Wrapping your gift…", () => api("gift", g))}
            onGroup={(g) => run("Starting the group gift on Base and chipping in…", () => api("group-gift", g))}
            onChipIn={() => run("Uncle Dayo is chipping in from Houston…", () => api("chip-in", {}))}
            onCallOff={() => run("Calling it off and refunding everyone on Base…", () => api("call-off", {}))}
          />
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
    {
      label: "Aunty Funmi sends a gift (alone, or with Uncle Dayo)",
      done: ev.some((e) => (e.kind === "gift" || e.kind === "group_gift") && e.status !== "failed" && e.status !== "rejected"),
      role: "relative",
      who: "Aunty Funmi",
    },
    { label: "Skip to morning", done: morning },
    { label: "Mum approves the pitch at breakfast", done: pitch?.status === "confirmed", role: "parent", who: "Mum" },
    { label: "Tobi reads his Morning Report and says thanks", done: ev.some((e) => e.kind === "thank_you"), role: "kid", who: "Tobi" },
    { label: "Bonus: fast-forward to 18, Mum graduates Tobi", done: ev.some((e) => e.kind === "graduation" && e.status === "confirmed"), role: "parent", who: "Mum" },
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
        <li>As Tobi, pitch a company to Mum and answer the coach&apos;s question.</li>
        <li>As Aunty Funmi, send a gift while Tobi sleeps.</li>
        <li>Skip to morning. The night shift delivers the gift and the allowance.</li>
        <li>As Mum, approve the pitch at breakfast and choose a match. Real shares are bought.</li>
        <li>Read Tobi&apos;s Morning Report, send a voice thank-you and save it as an image.</li>
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

type PitchInput = { ticker: Ticker; why: string; coachQ?: string; coachA?: string };

function KidNight({ state, busy, onPitch }: { state: State; busy: boolean; onPitch: (p: PitchInput) => void }) {
  const [pick, setPick] = useState<Ticker | null>(null);
  const [why, setWhy] = useState("");
  const [band, setBand] = useState<Band>(TOBI_BAND);
  const [cards, setCards] = useState<Partial<Record<string, Card & { source?: string }>>>({});
  const [coach, setCoach] = useState<{ question: string; source: string } | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const cardKey = pick ? `${pick}:${band}` : "";
  const card = pick ? cards[cardKey] ?? null : null;
  const pitch = state.events.find((e) => e.kind === "pitch" && e.status !== "failed");

  useEffect(() => {
    if (!pick || cards[cardKey]) return;
    fetch(`/api/ai/explain?ticker=${pick}&band=${band}`)
      .then((r) => r.json())
      .then((j) => j.card && setCards((c) => ({ ...c, [cardKey]: { ...j.card, source: j.source } })))
      .catch(() => {});
  }, [pick, band, cardKey, cards]);

  const askCoach = async () => {
    if (!pick || !why.trim()) return;
    setCoachLoading(true);
    try {
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker: pick, band: TOBI_BAND, why }),
      });
      const j = await res.json();
      setCoach(j.question ? { question: j.question, source: j.source } : { question: `What could go wrong for ${COMPANIES[pick].name}?`, source: "fallback" });
    } catch {
      setCoach({ question: `What could go wrong for ${COMPANIES[pick].name}?`, source: "fallback" });
    } finally {
      setCoachLoading(false);
    }
  };

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
                onClick={() => {
                  setPick(t);
                  setCoach(null);
                  setAnswer("");
                }}
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
              <div role="group" aria-label="Card written for ages" className="mb-3 flex flex-wrap items-center gap-1 text-xs">
                <span className="mr-1 text-moon-dim">Written for ages</span>
                {BANDS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={band === b.id}
                    onClick={() => setBand(b.id)}
                    className={`rounded-full px-2 py-1 ${band === b.id ? "bg-star font-semibold text-night-950" : "bg-night-700"}`}
                  >
                    {b.label}
                    {b.id === TOBI_BAND ? " (Tobi)" : ""}
                  </button>
                ))}
              </div>
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
                    {card.source === "ai" ? "Written live by Claude (AI)" : "Written with Claude (AI) while building Allowance,"} for ages{" "}
                    {BANDS.find((b) => b.id === band)!.label}. Learning only, not financial advice.
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
                if (!coach) void askCoach();
                else onPitch({ ticker: pick, why, coachQ: coach.question, coachA: answer });
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
                readOnly={!!coach}
                onChange={(e) => setWhy(e.target.value)}
                placeholder={pick === "AAPL" ? "Everyone in my class wants AirPods…" : "Their chips make my games look amazing…"}
                className="rounded-xl bg-white p-3 text-ink read-only:opacity-80"
              />
              <p className="text-right text-xs text-moon-dim">{why.length}/280</p>
              {coach && (
                <div className="flex flex-col gap-2 rounded-xl bg-night-800 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-star">🧑‍🏫 Pitch coach</p>
                  <p className="font-semibold">{coach.question}</p>
                  <label htmlFor="coach-answer" className="sr-only">
                    Your answer to the coach
                  </label>
                  <textarea
                    id="coach-answer"
                    maxLength={280}
                    rows={2}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Your answer goes to Mum with your pitch…"
                    className="rounded-xl bg-white p-3 text-ink"
                  />
                  <p className="text-xs text-moon-dim">
                    {coach.source === "ai" ? "Question asked live by Claude (AI)." : "Question written with Claude (AI) while building Allowance."} The coach never says
                    what to buy.
                  </p>
                </div>
              )}
              {!coach ? (
                <button type="submit" disabled={busy || coachLoading || !why.trim()} className="rounded-xl bg-star px-4 py-3 font-semibold text-night-950 disabled:opacity-60">
                  {coachLoading ? "The coach is thinking…" : "Next: one question from the coach"}
                </button>
              ) : (
                <button type="submit" disabled={busy || !answer.trim()} className="rounded-xl bg-star px-4 py-3 font-semibold text-night-950 disabled:opacity-60">
                  Send pitch to Mum ($0.01)
                </button>
              )}
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

const MATCHES = [0, 25, 50, 100];

function ParentView({
  state,
  busy,
  onApprove,
  onGraduate,
}: {
  state: State;
  busy: boolean;
  onApprove: (id: number, matchPct: number) => void;
  onGraduate: () => void;
}) {
  const pitches = state.events.filter((e) => e.kind === "pitch");
  const morning = state.session.morning;
  const [match, setMatch] = useState(50);
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
          {p.coach_q && (
            <div className={`mt-2 rounded-lg p-2 text-sm ${morning ? "bg-white" : "bg-night-700"}`}>
              <p className="opacity-80">🧑‍🏫 Coach asked: {p.coach_q}</p>
              {p.coach_a && <p>Tobi answered: “{p.coach_a}”</p>}
            </div>
          )}
          {p.status === "pending" && (
            <>
              <fieldset className="mt-3">
                <legend className="text-sm font-semibold">Match Tobi&apos;s investing</legend>
                <div className="mt-1 grid grid-cols-4 gap-1">
                  {MATCHES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={match === m}
                      onClick={() => setMatch(m)}
                      className={`rounded-lg px-2 py-2 text-sm ${match === m ? "bg-star font-semibold text-night-950" : morning ? "bg-white" : "bg-night-700"}`}
                    >
                      {m}%
                    </button>
                  ))}
                </div>
              </fieldset>
              <p className="mt-3 text-xs opacity-80">
                Approving buys {usd(p.usdc_micro + Math.floor((p.usdc_micro * match) / 100))} of a real Coinbase tokenized {COMPANIES[p.ticker!].name} share on Base:{" "}
                {usd(p.usdc_micro)} from Tobi&apos;s savings
                {match > 0 ? ` + ${usd(Math.floor((p.usdc_micro * match) / 100))} from you (${match}% match)` : ""}. Held in your family vault.
              </p>
              <button type="button" disabled={busy} onClick={() => onApprove(p.id, match)} className="mt-3 w-full rounded-xl bg-star px-4 py-3 font-semibold text-night-950 disabled:opacity-60">
                ✅ Approve (Demo approval)
              </button>
              <p className="mt-1 text-xs opacity-70">In the real app this step asks for Face ID or your fingerprint.</p>
            </>
          )}
          {p.status === "confirmed" && (
            <p className="mt-2 text-sm">
              Approved{p.match_pct > 0 ? ` with a ${p.match_pct}% match` : ""}. Tobi now owns {shares(p.tokens_raw)} shares.
            </p>
          )}
          {p.status === "failed" && <p className="mt-2 text-sm">That buy didn&apos;t go through, and no money moved.</p>}
          {p.txUrl && <TxLink href={p.txUrl} />}
        </article>
      ))}
      {morning && <Graduation state={state} busy={busy} onGraduate={onGraduate} />}
    </section>
  );
}

function Graduation({ state, busy, onGraduate }: { state: State; busy: boolean; onGraduate: () => void }) {
  const grad = state.events.find((e) => e.kind === "graduation" && e.status !== "failed");
  const owns = state.holdings?.stocks.some((s) => s.raw !== "0");
  const landing = state.events.some((e) => e.status === "sending" && e.kind !== "graduation");
  return (
    <article className="rounded-xl bg-sunrise-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-sunrise-700">Fast-forward: Tobi turns 18 🎓</p>
      {grad ? (
        <>
          <p className="mt-1 font-semibold">{grad.status === "confirmed" ? "🎓 Tobi graduated! His shares and savings are in his own wallet." : "Moving Tobi's shares…"}</p>
          <div className="flex flex-wrap gap-x-4">
            {grad.txUrl && <TxLink href={grad.txUrl} />}
            {grad.status === "confirmed" && grad.message && (
              <a href={`https://basescan.org/address/${grad.message}#tokentxns`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold underline">
                See Tobi&apos;s wallet ↗
              </a>
            )}
          </div>
          <p className="mt-2 text-xs opacity-70">
            In the demo, &quot;Tobi&apos;s wallet&quot; is Allowance&apos;s demo wallet, so the cents aren&apos;t sent somewhere nobody controls. In the real app, Tobi signs up with his
            own email and gets his own wallet.
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm">
            Years from now, Tobi signs up with his own email and gets his own wallet. Graduating sends every share and his savings out of the family vault to that
            wallet in one transaction, after checking each stock&apos;s transfer rules. His history comes with him.
          </p>
          <button
            type="button"
            disabled={busy || landing || !owns}
            onClick={onGraduate}
            className="mt-3 w-full rounded-xl bg-night-900 px-4 py-3 font-semibold text-moon disabled:opacity-60"
          >
            🎓 Graduate Tobi (Demo approval)
          </button>
          {!owns && <p className="mt-1 text-xs opacity-70">Tobi needs at least one share first. Approve his pitch above.</p>}
        </>
      )}
    </article>
  );
}

type GiftInput = { ticker: Ticker; occasion: string; message: string };

function RelativeView({
  state,
  busy,
  onGift,
  onGroup,
  onChipIn,
  onCallOff,
}: {
  state: State;
  busy: boolean;
  onGift: (g: GiftInput) => void;
  onGroup: (g: GiftInput) => void;
  onChipIn: () => void;
  onCallOff: () => void;
}) {
  const [ticker, setTicker] = useState<Ticker>("AAPL");
  const [occasion, setOccasion] = useState(OCCASIONS[1]);
  const [message, setMessage] = useState("Well done on your test, Tobi!");
  const [mode, setMode] = useState<"solo" | "group">("solo");
  const gift = state.events.find((e) => e.kind === "gift" && e.status !== "failed");
  const group = [...state.events].reverse().find((e) => e.kind === "group_gift" && e.status !== "failed");
  const contributions = group ? state.events.filter((e) => e.kind === "contribution" && e.ref_event_id === group.id && e.status !== "failed") : [];
  const raised = contributions.filter((c) => c.status === "confirmed").reduce((s, c) => s + c.usdc_micro, 0);
  const dayoIn = contributions.some((c) => c.gifter_name === "Uncle Dayo");
  const groupLive = group && group.status !== "rejected";
  const thanks = state.events.filter((e) => e.kind === "thank_you");
  const morning = state.session.morning;
  const now = state.session.virtualNow;
  const panel = morning ? "bg-sunrise-50" : "bg-night-800";

  return (
    <section className={`flex flex-col gap-3 rounded-2xl p-5 ${morning ? "bg-white" : "bg-night-900"}`}>
      <div className={`grid grid-cols-3 gap-2 rounded-xl p-3 text-center ${panel}`}>
        <div>
          <p className="text-xs opacity-70">London (Funmi)</p>
          <p className="text-xl font-bold">{clock(now, 0)}</p>
        </div>
        <div>
          <p className="text-xs opacity-70">Lagos (Tobi)</p>
          <p className="text-xl font-bold">{clock(now, 1)}</p>
        </div>
        <div>
          <p className="text-xs opacity-70">Houston (Dayo)</p>
          <p className="text-xl font-bold">{clock(now, -6)}</p>
        </div>
      </div>
      {!morning && <p className="text-center">It&apos;s {clock(now, 1)} in Lagos. Tobi will wake up to your gift. 🌙</p>}

      {thanks.map((t) => (
        <div key={t.id} className="flex flex-col gap-2 rounded-xl bg-sunrise-100 p-3 text-ink">
          {t.message && <p>💌 Tobi says: “{t.message}”</p>}
          {t.voiceUrl && (
            <>
              <p className="text-sm font-semibold">🎙️ Tobi sent you a voice note</p>
              <audio controls src={t.voiceUrl} className="h-10 max-w-full" />
            </>
          )}
        </div>
      ))}

      {gift ? (
        <div className={`rounded-xl p-4 ${panel}`}>
          <p className="font-semibold">
            🎁 {gift.occasion} gift: {usd(gift.usdc_micro)} of {COMPANIES[gift.ticker!].name}
          </p>
          <p className="text-sm opacity-80">
            {gift.status === "queued" ? "Queued for the night shift. Tap Skip to morning." : gift.status === "confirmed" ? "Delivered while Tobi slept." : "On its way…"}
          </p>
          {gift.txUrl && <TxLink href={gift.txUrl} />}
        </div>
      ) : groupLive ? (
        <GroupGiftCard group={group} contributions={contributions} raised={raised} dayoIn={dayoIn} busy={busy} morning={morning} onChipIn={onChipIn} onCallOff={onCallOff} />
      ) : morning ? (
        <p className="opacity-80">No gift was sent last night.</p>
      ) : (
        <>
          {group?.status === "rejected" && (
            <div className={`rounded-xl p-4 text-sm ${panel}`}>
              <p className="font-semibold">↩️ The group gift was called off and everyone got their money back.</p>
              {group.txUrl && <TxLink href={group.txUrl} />}
            </div>
          )}
          <div role="group" aria-label="Gift type" className="grid grid-cols-2 gap-2">
            {(
              [
                ["solo", "🎁 Just me"],
                ["group", "👨🏾‍👩🏾‍👧🏾 With Uncle Dayo"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={mode === id}
                onClick={() => setMode(id)}
                className={`rounded-xl p-3 font-semibold ${mode === id ? "bg-night-700 ring-2 ring-star" : "bg-night-800"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              (mode === "solo" ? onGift : onGroup)({ ticker, occasion, message });
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
              {mode === "solo" ? (
                <p>Amount: $0.02 USDC · Network: Base</p>
              ) : (
                <>
                  <p>Target: $0.02 USDC · You chip in $0.01, Uncle Dayo chips in $0.01 · Network: Base</p>
                  <p>The money waits in the vault&apos;s escrow until the night shift buys the shares. Anyone can take their part back before then.</p>
                </>
              )}
              <p>Tobi gets: a slice of a real Coinbase tokenized {COMPANIES[ticker].name} share</p>
              <p>Goes to: the Adeyemi family vault (demo; Allowance pays)</p>
            </div>
            <button type="submit" disabled={busy} className="rounded-xl bg-star px-4 py-3 font-semibold text-night-950 disabled:opacity-60">
              {mode === "solo" ? "🎁 Send gift" : "👨🏾‍👩🏾‍👧🏾 Start group gift and chip in $0.01"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}

function GroupGiftCard({
  group,
  contributions,
  raised,
  dayoIn,
  busy,
  morning,
  onChipIn,
  onCallOff,
}: {
  group: Ev;
  contributions: Ev[];
  raised: number;
  dayoIn: boolean;
  busy: boolean;
  morning: boolean;
  onChipIn: () => void;
  onCallOff: () => void;
}) {
  const pct = Math.min(100, Math.round((raised / group.usdc_micro) * 100));
  const open = group.status === "pending" || group.status === "queued";
  return (
    <div className={`flex flex-col gap-3 rounded-xl p-4 ${morning ? "bg-sunrise-50" : "bg-night-800"}`}>
      <p className="font-semibold">
        👨🏾‍👩🏾‍👧🏾 {group.occasion} group gift: {COMPANIES[group.ticker!].name} for Tobi
      </p>
      <div>
        <div className="h-3 overflow-hidden rounded-full bg-night-700" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Raised so far">
          <div className="h-full bg-star" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-sm">
          {usd(raised)} of {usd(group.usdc_micro)} raised
        </p>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {contributions.map((c) => (
          <li key={c.id}>
            {c.gifter_name === "Uncle Dayo" ? "🧔🏾 Uncle Dayo (Houston)" : "👩🏾‍🦱 Aunty Funmi (London)"}: {usd(c.usdc_micro)}{" "}
            {c.status === "refunded" ? "· refunded" : c.status === "sending" ? "· landing…" : ""}
            {c.txUrl && (
              <a href={c.txUrl} target="_blank" rel="noreferrer" className="ml-1 underline">
                Basescan ↗
              </a>
            )}
          </li>
        ))}
      </ul>
      {group.status === "confirmed" && (
        <>
          <p className="text-sm">Delivered while Tobi slept: {shares(group.tokens_raw)} shares.</p>
          {group.txUrl && <TxLink href={group.txUrl} />}
        </>
      )}
      {open && !morning && (
        <div className="flex flex-col gap-2">
          {!dayoIn && (
            <button type="button" disabled={busy} onClick={onChipIn} className="rounded-xl bg-star px-4 py-3 font-semibold text-night-950 disabled:opacity-60">
              🧔🏾 Switch to Uncle Dayo: chip in $0.01
            </button>
          )}
          {dayoIn && <p className="text-sm">🎯 Target reached! The night shift will turn it into shares. Tap Skip to morning.</p>}
          <button type="button" disabled={busy} onClick={onCallOff} className="text-sm underline disabled:opacity-60">
            Call it off and refund everyone
          </button>
          <p className="text-xs opacity-70">
            In the demo, Allowance&apos;s wallet pays both relatives&apos; parts, so a refund returns both at once. In the real app, each relative takes back their own part.
          </p>
        </div>
      )}
    </div>
  );
}

function MorningReport({ state, busy, onThank }: { state: State; busy: boolean; onThank: (giftId: number, text: string, voice: Blob | null) => void }) {
  const [text, setText] = useState("Thank you Aunty Funmi! I love it 🧡");
  const [voice, setVoice] = useState<Blob | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const gifts = state.events.filter((e) => e.kind === "gift" || (e.kind === "group_gift" && e.status !== "rejected"));
  const graduated = state.events.find((e) => e.kind === "graduation" && e.status === "confirmed");
  const pitches = state.events.filter((e) => e.kind === "pitch" && e.status === "confirmed");
  const waiting = state.events.find((e) => e.kind === "pitch" && (e.status === "pending" || e.status === "sending"));
  const allowance = [...state.events].reverse().find((e) => e.kind === "allowance" && e.status === "confirmed");
  const thanked = new Set(state.events.filter((e) => e.kind === "thank_you").map((e) => e.ref_event_id));
  const scoreOf = (id: number) => state.scores.find((s) => s.eventId === id);

  const save = async () => {
    setSaving("Making your card…");
    try {
      setSaving(await saveReportCard(state));
    } catch {
      setSaving("Couldn't make the image on this device.");
    }
  };

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
                {g.kind === "group_gift"
                  ? `🎁 Aunty Funmi and Uncle Dayo chipped in together for a slice of ${COMPANIES[g.ticker!].name} while you slept.`
                  : `🎁 Aunty Funmi sent you a slice of ${COMPANIES[g.ticker!].name} while you slept.`}
              </p>
              <p className="text-sm opacity-80">
                {g.occasion}: “{g.message}” · {shares(g.tokens_raw)} shares
              </p>
              <Score score={scoreOf(g.id)} label={`${g.kind === "group_gift" ? "The family's" : "Aunty Funmi's"} ${COMPANIES[g.ticker!].name} gift`} />
              {g.txUrl && <TxLink href={g.txUrl} />}
              {!thanked.has(g.id) ? (
                <form
                  className="mt-3 flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    onThank(g.id, text, voice);
                  }}
                >
                  <label htmlFor={`ty-${g.id}`} className="text-sm font-semibold">
                    Send a thank-you to {g.kind === "group_gift" ? "London and Houston" : "London"}
                  </label>
                  <input id={`ty-${g.id}`} value={text} maxLength={280} onChange={(e) => setText(e.target.value)} className="rounded-xl border border-sunrise-300 p-3" />
                  <VoiceRecorder onChange={setVoice} />
                  <button type="submit" disabled={busy || (!text.trim() && !voice)} className="rounded-xl bg-sunrise-500 px-4 py-3 font-semibold text-white disabled:opacity-60">
                    💌 Send thank-you{voice ? " with voice note" : ""}
                  </button>
                </form>
              ) : (
                <p className="mt-2 text-sm">
                  💌 Thank-you sent. {g.kind === "group_gift" ? "Aunty Funmi and Uncle Dayo" : "Aunty Funmi"} will see it when they wake up.
                </p>
              )}
            </>
          ) : (
            <p>{g.status === "sending" ? "⏳ Your gift is landing on Base right now…" : "Last night's gift couldn't be delivered this time, and no money moved."}</p>
          )}
        </article>
      ))}

      {pitches.map((p) => (
        <article key={p.id} className="rounded-2xl bg-white p-4">
          <p className="text-lg font-semibold">✅ Mum approved your {COMPANIES[p.ticker!].name} pitch!</p>
          {p.match_pct > 0 && (
            <p className="text-sm font-semibold text-sunrise-700">
              💛 Mum matched {p.match_pct}%: +{usd(p.match_micro)} on top of your {usd(p.usdc_micro)}.
            </p>
          )}
          <p className="text-sm opacity-80">You own {shares(p.tokens_raw)} shares of {COMPANIES[p.ticker!].name}.</p>
          <Score score={scoreOf(p.id)} label={`Your ${COMPANIES[p.ticker!].name} pitch`} />
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

      <article className="rounded-2xl bg-white p-4">
        {state.dividends.length > 0 ? (
          state.dividends.map((d) => (
            <p key={d.ticker} className="text-lg font-semibold">
              💸 {COMPANIES[d.ticker].name} paid you overnight! +{d.extraShares.toFixed(8).replace(/0+$/, "")} shares.
            </p>
          ))
        ) : (
          <p className="text-sm opacity-80">
            💸 Dividends: none of your companies paid one last night. When one does, the token&apos;s multiplier goes up and it shows here. We never make one up.
          </p>
        )}
      </article>

      {gifts.length === 0 && pitches.length === 0 && <p className="rounded-2xl bg-white p-4">A quiet night. Your allowance still landed!</p>}

      {graduated ? (
        <article className="rounded-2xl bg-white p-4">
          <p className="text-lg font-semibold">🎓 You graduated! Everything you own is in your own wallet now.</p>
          {graduated.txUrl && <TxLink href={graduated.txUrl} />}
        </article>
      ) : (
        <Savings state={state} />
      )}

      <div className="flex flex-col gap-1">
        <button type="button" onClick={save} className="rounded-xl bg-night-900 px-4 py-3 font-semibold text-moon">
          📸 Save my Morning Report as an image
        </button>
        {saving && <p className="text-center text-sm opacity-80">{saving}</p>}
      </div>

      <Leaderboard state={state} />

      <p className="text-xs opacity-70">Shares are real Coinbase tokenized stocks on Base, held in your family vault. Learning only, not financial advice.</p>
    </section>
  );
}

function Score({ score, label }: { score?: { changePct: number }; label: string }) {
  if (!score) return null;
  const pct = score.changePct;
  const flat = Math.abs(pct) < 0.05;
  return (
    <p className="mt-1 text-sm">
      📈 {label}: {flat ? "about the same" : `${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(2)}%`} since you got it.
      <span className="opacity-70"> (Live price on Base. Prices go up and down.)</span>
    </p>
  );
}

const MAX_VOICE_SECONDS = 30;

function VoiceRecorder({ onChange }: { onChange: (b: Blob | null) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [rec]);

  useEffect(() => {
    if (rec && secs >= MAX_VOICE_SECONDS) rec.stop();
  }, [rec, secs]);

  const start = async () => {
    setErr(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErr("Voice notes aren't supported on this browser. A written thank-you works too.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: r.mimeType.split(";")[0] || "audio/webm" });
        setUrl(URL.createObjectURL(blob));
        onChange(blob);
        setRec(null);
      };
      setSecs(0);
      r.start();
      setRec(r);
    } catch {
      setErr("Couldn't use the microphone. A written thank-you works too.");
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-sunrise-50 p-3 text-sm">
      {rec ? (
        <button type="button" onClick={() => rec.stop()} className="rounded-lg bg-red-600 px-3 py-2 font-semibold text-white">
          ⏹ Stop recording ({MAX_VOICE_SECONDS - secs}s left)
        </button>
      ) : url ? (
        <div className="flex flex-wrap items-center gap-2">
          <audio controls src={url} className="h-10 max-w-full" />
          <button
            type="button"
            onClick={() => {
              setUrl(null);
              onChange(null);
            }}
            className="underline"
          >
            Remove
          </button>
        </div>
      ) : (
        <button type="button" onClick={start} className="rounded-lg bg-white px-3 py-2 font-semibold">
          🎙️ Record a voice note (up to {MAX_VOICE_SECONDS}s)
        </button>
      )}
      {err && <p>{err}</p>}
    </div>
  );
}

/** Draws the Morning Report as a 1080x1350 image, then shares it (phones) or downloads it. */
async function saveReportCard(state: State): Promise<string> {
  const W = 1080;
  const H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#ffbf80");
  grad.addColorStop(1, "#fff8ef");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  const font = getComputedStyle(document.body).fontFamily || "sans-serif";
  const line = (text: string, y: number, size: number, weight = 400, color = "#2a1a10") => {
    g.fillStyle = color;
    g.font = `${weight} ${size}px ${font}`;
    // Simple word wrap.
    const words = text.split(" ");
    let cur = "";
    let yy = y;
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (g.measureText(next).width > W - 160 && cur) {
        g.fillText(cur, 80, yy);
        cur = w;
        yy += size * 1.3;
      } else cur = next;
    }
    if (cur) g.fillText(cur, 80, yy);
    return yy + size * 1.6;
  };

  let y = line("☀️ GOOD MORNING, TOBI", 150, 40, 700, "#b4461a");
  y = line("My Morning Report", y + 10, 84, 800);
  y += 20;
  const gift = state.events.find((e) => (e.kind === "gift" || e.kind === "group_gift") && e.status === "confirmed");
  if (gift)
    y = line(
      gift.kind === "group_gift"
        ? `🎁 Aunty Funmi (London) and Uncle Dayo (Houston) chipped in for a slice of ${COMPANIES[gift.ticker!].name} while I slept.`
        : `🎁 Aunty Funmi sent me a slice of ${COMPANIES[gift.ticker!].name} from London while I slept.`,
      y,
      46,
      600,
    );
  for (const p of state.events.filter((e) => e.kind === "pitch" && e.status === "confirmed")) {
    y = line(`✅ Mum approved my ${COMPANIES[p.ticker!].name} pitch${p.match_pct ? ` and matched ${p.match_pct}%` : ""}.`, y, 46, 600);
  }
  const allowance = state.events.find((e) => e.kind === "allowance" && e.status === "confirmed");
  if (allowance) y = line(`🌙 My allowance landed at midnight.`, y, 46, 600);
  for (const d of state.dividends) y = line(`💸 ${COMPANIES[d.ticker].name} paid me a dividend overnight!`, y, 46, 600);
  const owned = state.holdings?.stocks.filter((s) => s.raw !== "0") ?? [];
  if (owned.length) {
    y += 10;
    y = line("I own real pieces of:", y, 40, 700, "#b4461a");
    for (const s of owned) y = line(`${COMPANIES[s.ticker].emoji} ${COMPANIES[s.ticker].name}`, y, 52, 700);
  }
  g.fillStyle = "#2a1a10";
  g.font = `600 34px ${font}`;
  g.fillText("Allowance · the family money app that works the night shift", 80, H - 120);
  g.font = `400 28px ${font}`;
  g.fillText("Real tokenized stocks on Base. Learning only, not financial advice.", 80, H - 70);

  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("no blob"))), "image/png"));
  const file = new File([blob], "tobi-morning-report.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Tobi's Morning Report", text: "Look what arrived while I slept!" });
      return "Shared! 💌";
    } catch {
      // User closed the share sheet; fall back to a download.
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return "Saved to your downloads. Send it to Grandma on WhatsApp!";
}

/** Ranks by learning (pitches, approvals, thank-yous), never by returns. */
function Leaderboard({ state }: { state: State }) {
  const ev = state.events;
  const tobi = {
    name: "Tobi",
    face: "👦🏾",
    pitches: ev.filter((e) => e.kind === "pitch" && e.status !== "failed").length,
    approvals: ev.filter((e) => e.kind === "pitch" && e.status === "confirmed").length,
    thanks: ev.filter((e) => e.kind === "thank_you").length,
    live: true,
  };
  // Kemi and Dayo are fictional members of the demo family; their counts are fixed sample numbers.
  const rows = [
    tobi,
    { name: "Kemi (sister, 8)", face: "👧🏾", pitches: 1, approvals: 1, thanks: 1, live: false },
    { name: "Dayo (cousin, 15)", face: "🧑🏾", pitches: 2, approvals: 0, thanks: 1, live: false },
  ]
    .map((r) => ({ ...r, points: r.pitches + r.approvals * 2 + r.thanks }))
    .sort((a, b) => b.points - a.points);
  return (
    <section className="rounded-2xl bg-white p-4" aria-labelledby="lb">
      <h3 id="lb" className="text-lg font-semibold">
        🏆 Family leaderboard
      </h3>
      <p className="text-xs opacity-70">Points for pitches made (1), approvals won (2) and thank-yous sent (1). Never for how much money anyone made.</p>
      <ol className="mt-2 flex flex-col gap-1">
        {rows.map((r, i) => (
          <li key={r.name} className={`flex items-center justify-between rounded-lg px-2 py-1 ${r.live ? "bg-sunrise-100 font-semibold" : ""}`}>
            <span>
              {i + 1}. {r.face} {r.name}
            </span>
            <span className="text-sm">
              {r.points} pts · {r.pitches} pitch{r.pitches === 1 ? "" : "es"} · {r.approvals} approved · {r.thanks} thanks
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs opacity-70">Kemi and Dayo are demo family members with sample numbers. Tobi&apos;s are live from this demo.</p>
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
              {i.kind === "gift" || i.kind === "group_gift"
                ? `🎁 ${i.gifter_name ?? "A relative"} gifted ${usd(i.usdc_micro)} of ${i.company}`
                : i.kind === "graduation"
                  ? "🎓 A kid graduated: shares moved to their own wallet"
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
