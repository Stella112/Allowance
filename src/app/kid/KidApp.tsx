"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import VoiceRecorder from "@/components/VoiceRecorder";
import { FeedItem, Icon, TabBar } from "@/components/ui";

type Ticker = "AAPL" | "NVDA";
type Profile = { id: string; nickname: string; avatar: string };
type Pitch = { id: number; ticker: Ticker; why: string; usdc_micro: number; status: string; tokens_raw: string | null; match_pct: number; txUrl: string | null };
type KidState = {
  kid: { id: string; nickname: string; avatar: string; birth_year: number; max_per_pitch_micro: number };
  hasVault: boolean;
  holdings: { usdcMicro: string; stocks: { ticker: Ticker; raw: string; shares: number }[] } | null;
  allowance: { amountMicro: string; periodSec: string; nextReleaseAt: number } | null;
  pitches: Pitch[];
  report: Report;
};
type Report = {
  gifts: { id: number; kind: string; gifterName: string | null; occasion: string | null; message: string | null; ticker: Ticker | null; usdcMicro: number; tokensRaw: string | null; txUrl: string; thanked: boolean }[];
  approved: { id: number; ticker: Ticker; usdcMicro: number; matchPct: number; matchMicro: number; txUrl: string | null }[];
  allowances: { usdcMicro: number; txUrl: string | null }[];
  dividends: { ticker: Ticker }[];
  scores: { pitchId: number; ticker: Ticker; changePct: number | null }[];
  leaderboard: { nickname: string; avatar: string; me: boolean; pitchesMade: number; approvals: number; thankYous: number; points: number }[];
};
type Card = { whatItDoes: string; howItMakesMoney: string; oneThingToWatch: string; source?: string };
type PitchInput = { ticker: Ticker; why: string; amount: number; coachQ?: string; coachA?: string };

const COMPANIES: Record<Ticker, { name: string; emoji: string }> = { AAPL: { name: "Apple", emoji: "🍎" }, NVDA: { name: "Nvidia", emoji: "🎮" } };
const usd = (micro: number | string | null | undefined) => {
  const n = Number(micro ?? 0);
  return `$${(n / 1e6).toFixed(n % 10_000 === 0 ? 2 : 3)}`;
};
const bandFor = (birthYear: number) => {
  const age = new Date().getUTCFullYear() - birthYear;
  return age <= 9 ? "6-9" : age <= 13 ? "10-13" : "14-17";
};
const isBedtime = () => {
  const h = new Date().getHours();
  return h >= 19 || h < 6;
};

async function kidApi<T>(body?: unknown): Promise<T> {
  const res = await fetch(
    "/api/kid",
    body === undefined
      ? { cache: "no-store" }
      : body instanceof FormData
        ? { method: "POST", body }
        : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? "Something went wrong."), { status: res.status });
  return json as T;
}

export default function KidApp() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [state, setState] = useState<KidState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Bedtime (7pm to 6am on this device) switches to the calm night theme. This app renders in the browser
  // only (see KidLoader), so the device clock is the one used.
  const [night] = useState(isBedtime);
  const router = useRouter();

  useEffect(() => {
    kidApi<{ profiles?: Profile[] } & Partial<KidState>>()
      .then((r) => (r.profiles ? setProfiles(r.profiles) : setState(r as KidState)))
      .catch((e) => setError((e as { status?: number }).status === 401 ? "Ask your parent to open Allowance on this phone first." : e.message))
      .finally(() => setLoaded(true));
  }, []);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // Cream by day; deep violet at bedtime (the night shift). Cards stay light with dark text in both.
  const theme = night ? "bg-[#1F1A4D] text-white" : "text-ink";

  return (
    <div className={`min-h-full flex-1 ${theme}`}>
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-32 pt-5">
        {!state && (
          <Link href="/parent" className="text-sm font-semibold">
            ← Grown-ups
          </Link>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900">
            {error}
          </p>
        )}
        {busy && (
          <p aria-live="polite" className="rounded-xl bg-white px-3 py-2 text-sm text-ink">
            ⏳ {busy}
          </p>
        )}
        {!loaded ? (
          <p className="opacity-70">Loading…</p>
        ) : state ? (
          <KidHome
            state={state}
            night={night}
            busy={!!busy}
            onPitch={(p) => run(night ? "Sending your bedtime pitch…" : "Sending your pitch…", async () => setState(await kidApi<KidState>({ action: "pitch", ...p })))}
            onThank={(giftId, text, voice) =>
              run("Sending your thank-you…", async () => {
                if (!voice) return setState(await kidApi<KidState>({ action: "thank-you", giftId, text }));
                const form = new FormData();
                form.set("giftId", String(giftId));
                form.set("text", text);
                form.set("voice", voice, "thank-you");
                setState(await kidApi<KidState>(form));
              })
            }
            onLeave={() =>
              run("Switching back…", async () => {
                await kidApi({ action: "leave" });
                router.push("/parent");
              })
            }
          />
        ) : profiles ? (
          <Switcher
            profiles={profiles}
            busy={!!busy}
            onSwitch={(kidId, pin) => run("Checking your PIN…", async () => setState(await kidApi<KidState>({ action: "switch", kidId, pin })))}
          />
        ) : null}
      </main>
    </div>
  );
}

function Switcher({ profiles, busy, onSwitch }: { profiles: Profile[]; busy: boolean; onSwitch: (kidId: string, pin: string) => void }) {
  const [pick, setPick] = useState<Profile | null>(profiles.length === 1 ? profiles[0] : null);
  const [pin, setPin] = useState("");
  if (!profiles.length) return <p>No kids yet. A parent adds them on the grown-ups page.</p>;
  return (
    <section className="card flex flex-col gap-5">
      <h1 className="screen-title">Who&apos;s using Allowance?</h1>
      <div className="grid grid-cols-3 gap-2">
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={pick?.id === p.id}
            onClick={() => setPick(p)}
            className={`flex flex-col items-center rounded-3xl p-3 ${pick?.id === p.id ? "bg-night-700" : "bg-night-800"}`}
          >
            <span className="text-4xl" aria-hidden>
              {p.avatar}
            </span>
            <span className="mt-1 font-extrabold">{p.nickname}</span>
          </button>
        ))}
      </div>
      {pick && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSwitch(pick.id, pin);
            setPin("");
          }}
        >
          <label className="label" htmlFor="kid-pin">
            {pick.nickname}&apos;s PIN
          </label>
          <input
            id="kid-pin"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="field text-center text-2xl tracking-[0.5em]"
          />
          <button type="submit" disabled={busy || pin.length !== 4} className="btn">
            Switch to {pick.nickname}
          </button>
        </form>
      )}
    </section>
  );
}


function Piggy({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={`piggy ${className}`} aria-hidden>
      <ellipse cx="60" cy="92" rx="38" ry="5" fill="#25243A" opacity="0.12" />
      <ellipse cx="58" cy="56" rx="42" ry="32" fill="#FFB9A8" stroke="#25243A" strokeWidth="3" />
      <circle cx="96" cy="54" r="12" fill="#FF8F73" stroke="#25243A" strokeWidth="3" />
      <circle cx="93" cy="52" r="2" fill="#25243A" />
      <circle cx="99" cy="52" r="2" fill="#25243A" />
      <circle cx="76" cy="42" r="3.5" fill="#25243A" />
      <path d="M38 28 l-4 -14 l14 8 z" fill="#FF8F73" stroke="#25243A" strokeWidth="3" strokeLinejoin="round" />
      <rect x="44" y="22" width="22" height="5" rx="2.5" fill="#25243A" />
      <path d="M32 82 v8 M52 86 v6 M70 86 v6 M86 80 v8" stroke="#25243A" strokeWidth="6" strokeLinecap="round" />
      <path d="M16 52 q-10 -4 -6 -12" stroke="#25243A" strokeWidth="3" fill="none" strokeLinecap="round" />
      <g className="coin-drop">
        <circle cx="55" cy="6" r="9" fill="#FFD979" stroke="#25243A" strokeWidth="3" />
      </g>
    </svg>
  );
}

function Rocket({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={`rocket ${className}`} aria-hidden>
      <g className="rocket-fly">
        <path d="M60 10 c22 16 26 46 16 70 h-32 c-10 -24 -6 -54 16 -70 z" fill="#ffffff" stroke="#25243A" strokeWidth="3" />
        <path d="M60 10 c8 6 13 13 16 22 h-32 c3 -9 8 -16 16 -22 z" fill="#FFD979" stroke="#25243A" strokeWidth="3" />
        <circle cx="60" cy="48" r="9" fill="#B9E9D0" stroke="#25243A" strokeWidth="3" />
        <path d="M44 64 l-14 18 l16 -2 z M76 64 l14 18 l-16 -2 z" fill="#7656E8" stroke="#25243A" strokeWidth="3" strokeLinejoin="round" />
        <g className="flame">
          <path d="M50 82 q10 26 20 0 z" fill="#FF8F73" stroke="#25243A" strokeWidth="3" />
        </g>
      </g>
    </svg>
  );
}

type Goal = { name: string; emoji: string; targetMicro: number };
const GOAL_IDEAS = [
  { name: "New bike", emoji: "🚲" },
  { name: "Football boots", emoji: "⚽" },
  { name: "Headphones", emoji: "🎧" },
  { name: "Art set", emoji: "🎨" },
];

/** A savings goal lives on this device only (it's for motivation; the money itself is on Base). */
function useGoal(kidId: string) {
  const key = `allowance:goal:${kidId}`;
  const [goal, setGoalState] = useState<Goal | null>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as Goal) : null;
    } catch {
      return null;
    }
  });
  const setGoal = (g: Goal | null) => {
    setGoalState(g);
    try {
      if (g) localStorage.setItem(key, JSON.stringify(g));
      else localStorage.removeItem(key);
    } catch {
      // Storage blocked: the goal just lasts for this visit.
    }
  };
  return [goal, setGoal] as const;
}

function KidHome({
  state,
  night,
  busy,
  onPitch,
  onThank,
  onLeave,
}: {
  state: KidState;
  night: boolean;
  busy: boolean;
  onPitch: (p: PitchInput) => void;
  onThank: (giftId: number, text: string, voice: Blob | null) => void;
  onLeave: () => void;
}) {
  const { kid, holdings } = state;
  const band = bandFor(kid.birth_year);
  const owned = holdings?.stocks.filter((s) => s.raw !== "0") ?? [];
  const savings = Number(holdings?.usdcMicro ?? 0);
  const [tab, setTab] = useState<"home" | "invest" | "goals" | "report">("home");
  const [goal, setGoal] = useGoal(kid.id);
  const goalPct = goal ? Math.min(100, Math.round((savings / goal.targetMicro) * 100)) : 0;
  const newThings = state.report.gifts.length + state.report.approved.length + state.report.allowances.length;
  const hasAllowance = !!state.allowance && state.allowance.amountMicro !== "0";
  const go = (t: typeof tab) => {
    setTab(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <span className="avatar text-ink">{kid.avatar}</span>
        <div className="flex-1">
          <p className="text-sm font-bold opacity-70">{night ? "Good night" : "Hello"}</p>
          <p className="text-xl font-extrabold leading-tight">{kid.nickname}</p>
        </div>
      </header>

      {tab === "home" && (
        <div>
          <section className="stack-hero">
            <div className="flex items-start">
              <div className="flex-1">
                <p className="eyebrow">Total savings</p>
                <p className="stat mt-1">{state.hasVault ? usd(savings) : "…"}</p>
                <p className="eyebrow mt-1">Live from Base</p>
              </div>
              <Piggy className="h-20 w-24" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => go("invest")} className="btn">
                Pitch
              </button>
              <button type="button" onClick={() => go("report")} className="btn btn-white">
                My report
              </button>
            </div>
          </section>

          <button type="button" onClick={() => go("goals")} className="stack-lime block w-full text-left">
            <span className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="eyebrow block">{goal ? `Saving for ${goal.name}` : "Goal progress"}</span>
                <span className="mt-1 block text-3xl font-extrabold tracking-tight">{goal ? `${goalPct}%` : "Set a goal"}</span>
                {goal && (
                  <span className="progress mt-2 block">
                    <span className="block h-full rounded-full bg-ink" style={{ width: `${goalPct}%` }} />
                  </span>
                )}
              </span>
              <Rocket className="h-16 w-14 flex-none" />
            </span>
          </button>

          <section className="stack-sheet">
            <div className="row">
              <h2 className="section-title flex-1">Companies I own</h2>
              <button type="button" onClick={() => go("invest")} className="text-sm font-extrabold text-moon-dim">
                Pitch one
              </button>
            </div>
            {owned.map((s) => (
              <div key={s.ticker} className="row">
                <span className="tile" aria-hidden>
                  {COMPANIES[s.ticker].emoji}
                </span>
                <span className="flex-1 font-extrabold">{COMPANIES[s.ticker].name}</span>
                <span className="text-sm font-bold text-moon-dim">{s.shares.toFixed(7).replace(/0+$/, "")} shares</span>
              </div>
            ))}
            {!owned.length && <p className="row text-sm font-semibold text-moon-dim">None yet. Pitch a company and ask your parent!</p>}
            <div className="row">
              <span className="tile" aria-hidden>
                🌙
              </span>
              <span className="flex-1 font-extrabold">Allowance</span>
              <span className="text-sm font-bold text-moon-dim">{hasAllowance ? `${usd(state.allowance!.amountMicro)} while you sleep` : "Not set yet"}</span>
            </div>
          </section>
        </div>
      )}

      {tab === "invest" && (
        <>
          <h1 className="screen-title">Invest</h1>
          <PitchForm kidName={kid.nickname} band={band} night={night} busy={busy} maxMicro={Math.min(kid.max_per_pitch_micro, savings)} onPitch={onPitch} />
          {state.pitches.length > 0 && (
            <section className="card py-2">
              <h2 className="section-title pt-2">My pitches</h2>
              {state.pitches.map((p) => (
                <article key={p.id} className="row items-start">
                  <span className="tile" aria-hidden>
                    {COMPANIES[p.ticker].emoji}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-extrabold">
                      {usd(p.usdc_micro)} of {COMPANIES[p.ticker].name}
                    </p>
                    <p className="font-semibold text-moon-dim">{pitchStatus(p, night)}</p>
                    {p.txUrl && (
                      <a href={p.txUrl} target="_blank" rel="noreferrer" className="font-bold underline">
                        See it on Basescan ↗
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}

      {tab === "goals" && (
        <>
          <h1 className="screen-title">My goals</h1>
          {goal ? (
            <div>
              <section className="stack-hero flex items-center pb-16">
                <div className="flex-1">
                  <p className="eyebrow">Savings</p>
                  <p className="stat mt-1">{usd(savings)}</p>
                  <p className="mt-1 font-extrabold">{goal.name}</p>
                </div>
                <span className="text-6xl" aria-hidden>
                  {goal.emoji}
                </span>
              </section>
              <section className="card relative mx-3 -mt-10">
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-extrabold">Saved {goalPct}%</span>
                  <span className="text-sm font-bold text-moon-dim">
                    {usd(savings)} / {usd(goal.targetMicro)}
                  </span>
                </div>
                <div className="progress mt-3" role="progressbar" aria-valuenow={goalPct} aria-valuemin={0} aria-valuemax={100} aria-label={goal.name}>
                  <div style={{ width: `${goalPct}%` }} />
                </div>
                <button type="button" onClick={() => setGoal(null)} className="mt-4 text-sm font-extrabold underline">
                  Change goal
                </button>
              </section>
            </div>
          ) : (
            <GoalPicker onPick={setGoal} />
          )}
        </>
      )}

      {tab === "report" &&
        (night ? (
          <>
            <h1 className="screen-title">Morning Report</h1>
            <p className="card font-bold">🌙 Your Morning Report is ready after 6am. Sweet dreams!</p>
          </>
        ) : (
          <MorningReport state={state} busy={busy} onThank={onThank} />
        ))}

      <div className="mt-2 flex flex-col items-center gap-2 text-center">
        <button type="button" onClick={onLeave} className="text-sm font-extrabold underline">
          I&apos;m done, give the phone back
        </button>
        <p className="max-w-xs text-xs font-semibold opacity-60">Kids can only ask. Only a grown-up can approve, with Face ID. Learning only, not financial advice.</p>
      </div>

      <TabBar
        label="Kid sections"
        active={tab}
        onPick={go}
        items={[
          { id: "home", label: "Home", icon: <Icon name="home" /> },
          { id: "invest", label: "Invest", icon: <Icon name="chart" /> },
          { id: "goals", label: "Goals", icon: <Icon name="target" /> },
          { id: "report", label: "Report", icon: <Icon name="sun" />, badge: newThings },
        ]}
      />
    </div>
  );
}

function GoalPicker({ onPick }: { onPick: (g: Goal) => void }) {
  const [pick, setPick] = useState(GOAL_IDEAS[0]);
  const [target, setTarget] = useState("20");
  return (
    <section className="card flex flex-col gap-4">
      <p className="section-title">What are you saving for?</p>
      <div className="grid grid-cols-2 gap-2">
        {GOAL_IDEAS.map((g) => (
          <button
            key={g.name}
            type="button"
            aria-pressed={pick.name === g.name}
            onClick={() => setPick(g)}
            className={`rounded-3xl p-4 text-left font-extrabold ${pick.name === g.name ? "bg-lime" : "bg-night-800"}`}
          >
            <span className="text-3xl" aria-hidden>
              {g.emoji}
            </span>
            <span className="mt-1 block text-sm">{g.name}</span>
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="label">How much does it cost? ($)</span>
        <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className="field" />
      </label>
      <button type="button" disabled={!(Number(target) > 0)} onClick={() => onPick({ ...pick, targetMicro: Math.round(Number(target) * 1e6) })} className="btn">
        Start saving
      </button>
    </section>
  );
}

function pitchStatus(p: Pitch, night: boolean) {
  switch (p.status) {
    case "pending":
      return night ? "your parent will see this in the morning 🌙" : "waiting for your parent";
    case "confirmed":
      return `approved! You own a piece of ${COMPANIES[p.ticker].name}${p.match_pct ? ` (matched ${p.match_pct}%)` : ""} 🎉`;
    case "declined":
      return "not this time";
    case "sending":
      return "buying now…";
    default:
      return "didn't go through";
  }
}

function PitchForm({
  kidName,
  band,
  night,
  busy,
  maxMicro,
  onPitch,
}: {
  kidName: string;
  band: string;
  night: boolean;
  busy: boolean;
  maxMicro: number;
  onPitch: (p: PitchInput) => void;
}) {
  const [pick, setPick] = useState<Ticker | null>(null);
  const [why, setWhy] = useState("");
  const [amount, setAmount] = useState("0.5");
  const [cards, setCards] = useState<Partial<Record<Ticker, Card>>>({});
  const [coach, setCoach] = useState<{ question: string; source: string } | null>(null);
  const [answer, setAnswer] = useState("");
  const card = pick ? cards[pick] : undefined;

  useEffect(() => {
    if (!pick || cards[pick]) return;
    fetch(`/api/ai/explain?ticker=${pick}&band=${band}`)
      .then((r) => r.json())
      .then((j) => j.card && setCards((c) => ({ ...c, [pick]: { ...j.card, source: j.source } })))
      .catch(() => {});
  }, [pick, band, cards]);

  const askCoach = async () => {
    const res = await fetch("/api/ai/coach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker: pick, band, why }) });
    const j = await res.json().catch(() => ({}));
    setCoach({ question: j.question ?? `What could go wrong for ${COMPANIES[pick!].name}?`, source: j.source ?? "fallback" });
  };

  if (maxMicro < 10_000) return <p className="card font-bold">When your allowance lands, you can pitch a company to your parent here.</p>;

  const amountMicro = Number(amount) * 1e6;
  return (
    <section className="card flex flex-col gap-4">
      <h2 className="section-title">{night ? "🌙 Bedtime pitch" : "Pick a company"}</h2>
      <div className="grid grid-cols-2 gap-2">
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
            className={`flex items-center gap-2 rounded-3xl p-4 font-extrabold ${pick === t ? "bg-lime" : "bg-night-800"}`}
          >
            <span className="text-2xl" aria-hidden>
              {COMPANIES[t].emoji}
            </span>
            {COMPANIES[t].name}
          </button>
        ))}
      </div>
      {pick && card && (
        <dl className="flex flex-col gap-1 rounded-3xl bg-night-800 p-4 text-sm">
          <dt className="font-extrabold">What it does</dt>
          <dd className="mb-2">{card.whatItDoes}</dd>
          <dt className="font-extrabold">How it makes money</dt>
          <dd className="mb-2">{card.howItMakesMoney}</dd>
          <dt className="font-extrabold">One thing to watch</dt>
          <dd className="mb-2">{card.oneThingToWatch}</dd>
          <p className="note">
            {card.source === "ai" ? "Written live by Claude (AI)" : "Written with Claude (AI) while building Allowance,"} for ages {band.replace("-", "–")}. Learning only, not
            financial advice.
          </p>
        </dl>
      )}
      {pick && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!coach) void askCoach();
            else onPitch({ ticker: pick, why, amount: Number(amount), coachQ: coach.question, coachA: answer });
          }}
        >
          <label htmlFor="why" className="label">
            Why do you like {COMPANIES[pick].name}?
          </label>
          <textarea id="why" rows={3} maxLength={280} value={why} readOnly={!!coach} onChange={(e) => setWhy(e.target.value)} className="field" />
          <label className="flex flex-col gap-1.5">
            <span className="label">How much? ($)</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="field" />
            <span className="note">Up to {usd(maxMicro)}</span>
          </label>
          {coach && (
            <div className="flex flex-col gap-2 rounded-3xl bg-night-800 p-4">
              <p className="eyebrow">🧑‍🏫 Pitch coach</p>
              <p className="font-extrabold">{coach.question}</p>
              <textarea aria-label="Your answer to the coach" rows={2} maxLength={280} value={answer} onChange={(e) => setAnswer(e.target.value)} className="field" />
              <p className="note">
                {coach.source === "ai" ? "Asked live by Claude (AI)." : "Question written with Claude (AI) while building Allowance."} The coach never says what to buy.
              </p>
            </div>
          )}
          <button type="submit" disabled={busy || !why.trim() || (!!coach && !answer.trim()) || !(amountMicro > 0) || amountMicro > maxMicro} className="btn">
            {!coach ? "Next: one question from the coach" : `Send to my parent${night ? " (they'll see it at breakfast)" : ""}`}
          </button>
          <p className="note text-center">{kidName}, you can only ask. Your parent decides.</p>
        </form>
      )}
    </section>
  );
}

function MorningReport({ state, busy, onThank }: { state: KidState; busy: boolean; onThank: (giftId: number, text: string, voice: Blob | null) => void }) {
  const r = state.report;
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [voices, setVoices] = useState<Record<number, Blob | null>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const scoreOf = (id: number) => r.scores.find((s) => s.pitchId === id)?.changePct ?? null;
  const empty = !r.gifts.length && !r.approved.length && !r.allowances.length && !r.dividends.length;

  return (
    <section className="flex flex-col gap-3">
      <div className="stack-hero pb-6">
        <p className="eyebrow">What arrived in the last 24 hours, straight from Base</p>
        <h1 className="screen-title mt-1">Your Morning Report</h1>
      </div>
      {empty && <p className="card font-bold">A quiet night. Check back tomorrow morning!</p>}
      {r.gifts.map((g) => (
        <FeedItem
          key={g.id}
          icon="🎁"
          title={
            g.kind === "group_settled"
              ? `Your family chipped in together for ${usd(g.usdcMicro)} of ${g.ticker ? COMPANIES[g.ticker].name : "shares"}!`
              : `${g.gifterName ?? "Someone in your family"} sent you a slice of ${g.ticker ? COMPANIES[g.ticker].name : "a company"} while you slept.`
          }
        >
          {(g.occasion || g.message) && (
            <p className="mt-1 text-sm font-semibold text-moon-dim">
              {g.occasion}
              {g.message ? `: “${g.message}”` : ""}
            </p>
          )}
          <a href={g.txUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-bold underline">
            See it on Basescan ↗
          </a>
          {g.thanked ? (
            <p className="mt-2 text-sm font-semibold">💌 Thank-you sent. They&apos;ll see it when they open their gift link.</p>
          ) : (
            <form
              className="mt-3 flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onThank(g.id, texts[g.id] ?? "", voices[g.id] ?? null);
              }}
            >
              <label htmlFor={`ty-${g.id}`} className="label">
                Say thank you
              </label>
              <input
                id={`ty-${g.id}`}
                maxLength={280}
                value={texts[g.id] ?? ""}
                placeholder="Thank you so much! 🧡"
                onChange={(e) => setTexts((t) => ({ ...t, [g.id]: e.target.value }))}
                className="field"
              />
              <VoiceRecorder onChange={(b) => setVoices((v) => ({ ...v, [g.id]: b }))} />
              <button type="submit" disabled={busy || (!(texts[g.id] ?? "").trim() && !voices[g.id])} className="btn">
                Send thank-you
              </button>
            </form>
          )}
        </FeedItem>
      ))}
      {r.approved.map((p) => {
        const change = scoreOf(p.id);
        return (
          <FeedItem key={p.id} icon="✅" title={`Your ${COMPANIES[p.ticker].name} pitch was approved! You own a piece of it.`}>
            {p.matchPct > 0 && (
              <p className="mt-1 text-sm font-bold text-sunrise-700">
                Matched {p.matchPct}%: +{usd(p.matchMicro)} on top of your {usd(p.usdcMicro)}.
              </p>
            )}
            {change !== null && (
              <p className="mt-1 text-sm font-semibold">
                Since you picked it: {Math.abs(change) < 0.05 ? "about the same" : `${change > 0 ? "up" : "down"} ${Math.abs(change).toFixed(2)}%`}.{" "}
                <span className="text-moon-dim">(Live price on Base. Prices go up and down.)</span>
              </p>
            )}
            {p.txUrl && (
              <a href={p.txUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-bold underline">
                See it on Basescan ↗
              </a>
            )}
          </FeedItem>
        );
      })}
      {r.allowances.map((a, i) => (
        <FeedItem key={i} icon="🌙" title={`Your allowance landed at midnight: ${usd(a.usdcMicro)}`}>
          {a.txUrl && (
            <a href={a.txUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-bold underline">
              See it on Basescan ↗
            </a>
          )}
        </FeedItem>
      ))}
      {r.dividends.map((d) => (
        <FeedItem key={d.ticker} icon="💸" title={`${COMPANIES[d.ticker].name} paid you overnight! Your shares grew.`} />
      ))}
      {r.leaderboard.length > 1 && (
        <section className="card" aria-labelledby="lb">
          <h2 id="lb" className="section-title">
            Family leaderboard
          </h2>
          <p className="note">Points for pitches (1), approvals (2) and thank-yous (1). Never for money made.</p>
          <ol className="mt-2 flex flex-col">
            {r.leaderboard.map((l, i) => (
              <li key={l.nickname} className="row">
                <span className="w-4 font-extrabold text-moon-dim">{i + 1}</span>
                <span className="tile" aria-hidden>
                  {l.avatar}
                </span>
                <span className={`flex-1 ${l.me ? "font-extrabold" : "font-bold"}`}>{l.nickname}</span>
                <span className="text-sm font-bold">{l.points} pts</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {!empty && (
        <button
          type="button"
          onClick={() =>
            saveCard(state)
              .then(setSaved)
              .catch(() => setSaved("Couldn't make the image on this device."))
          }
          className="btn btn-white shadow"
        >
          Save my Morning Report as an image
        </button>
      )}
      {saved && <p className="text-center text-sm">{saved}</p>}
    </section>
  );
}

/** Draws the Morning Report as a 1080x1350 picture to share with family (share sheet on phones, download elsewhere). */
async function saveCard(state: KidState): Promise<string> {
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
  let y = 150;
  const line = (text: string, size: number, weight = 600, color = "#2a1a10") => {
    g.fillStyle = color;
    g.font = `${weight} ${size}px ${font}`;
    let cur = "";
    for (const w of text.split(" ")) {
      const next = cur ? `${cur} ${w}` : w;
      if (g.measureText(next).width > W - 160 && cur) {
        g.fillText(cur, 80, y);
        cur = w;
        y += size * 1.3;
      } else cur = next;
    }
    if (cur) g.fillText(cur, 80, y);
    y += size * 1.6;
  };
  const r = state.report;
  line(`☀️ GOOD MORNING, ${state.kid.nickname.toUpperCase()}`, 40, 700, "#b4461a");
  line("My Morning Report", 84, 800);
  for (const gift of r.gifts)
    line(`🎁 ${gift.kind === "group_settled" ? "My family chipped in for" : `${gift.gifterName ?? "Family"} sent me`} a slice of ${gift.ticker ? COMPANIES[gift.ticker].name : "a company"}.`, 46);
  for (const p of r.approved) line(`✅ My ${COMPANIES[p.ticker].name} pitch was approved${p.matchPct ? ` and matched ${p.matchPct}%` : ""}.`, 46);
  if (r.allowances.length) line("🌙 My allowance landed at midnight.", 46);
  for (const d of r.dividends) line(`💸 ${COMPANIES[d.ticker].name} paid me a dividend overnight!`, 46);
  g.font = `600 34px ${font}`;
  g.fillStyle = "#2a1a10";
  g.fillText("Allowance · the family money app that works the night shift", 80, H - 120);
  g.font = `400 28px ${font}`;
  g.fillText("Real tokenized stocks on Base. Learning only, not financial advice.", 80, H - 70);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("no image"))), "image/png"));
  const file = new File([blob], "morning-report.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "My Morning Report" });
      return "Shared! 💌";
    } catch {
      // Share sheet closed: fall back to a download.
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return "Saved to your downloads. Send it to Grandma on WhatsApp!";
}
