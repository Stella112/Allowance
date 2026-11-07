"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import VoiceRecorder from "@/components/VoiceRecorder";

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

  const theme = night ? "bg-night-950 text-moon" : "bg-sunrise-50 text-ink";
  const panel = night ? "bg-night-900" : "bg-white";

  return (
    <div className={`min-h-full flex-1 ${theme}`}>
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6">
        <Link href="/parent" className="text-sm font-semibold">
          ← Grown-ups
        </Link>
        {error && (
          <p role="alert" className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900">
            {error}
          </p>
        )}
        {busy && (
          <p aria-live="polite" className={`rounded-xl px-3 py-2 text-sm ${panel}`}>
            ⏳ {busy}
          </p>
        )}
        {!loaded ? (
          <p className="opacity-70">Loading…</p>
        ) : state ? (
          <KidHome
            state={state}
            night={night}
            panel={panel}
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
            panel={panel}
            busy={!!busy}
            onSwitch={(kidId, pin) => run("Checking your PIN…", async () => setState(await kidApi<KidState>({ action: "switch", kidId, pin })))}
          />
        ) : null}
      </main>
    </div>
  );
}

function Switcher({ profiles, panel, busy, onSwitch }: { profiles: Profile[]; panel: string; busy: boolean; onSwitch: (kidId: string, pin: string) => void }) {
  const [pick, setPick] = useState<Profile | null>(profiles.length === 1 ? profiles[0] : null);
  const [pin, setPin] = useState("");
  if (!profiles.length) return <p>No kids yet. A parent adds them on the grown-ups page.</p>;
  return (
    <section className={`flex flex-col gap-4 rounded-2xl p-5 ${panel}`}>
      <h1 className="text-2xl font-bold">Who&apos;s using Allowance?</h1>
      <div className="grid grid-cols-3 gap-2">
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={pick?.id === p.id}
            onClick={() => setPick(p)}
            className={`flex flex-col items-center rounded-2xl p-3 ${pick?.id === p.id ? "ring-2 ring-star" : ""}`}
          >
            <span className="text-4xl" aria-hidden>
              {p.avatar}
            </span>
            <span className="mt-1 font-semibold">{p.nickname}</span>
          </button>
        ))}
      </div>
      {pick && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSwitch(pick.id, pin);
            setPin("");
          }}
        >
          <label className="sr-only" htmlFor="kid-pin">
            {pick.nickname}&apos;s PIN
          </label>
          <input
            id="kid-pin"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="PIN"
            className="w-32 rounded-xl bg-white px-3 py-2 text-center text-2xl tracking-widest text-ink"
          />
          <button type="submit" disabled={busy || pin.length !== 4} className="rounded-xl bg-star px-4 font-semibold text-night-950 disabled:opacity-60">
            Switch to {pick.nickname}
          </button>
        </form>
      )}
    </section>
  );
}

function KidHome({
  state,
  night,
  panel,
  busy,
  onPitch,
  onThank,
  onLeave,
}: {
  state: KidState;
  night: boolean;
  panel: string;
  busy: boolean;
  onPitch: (p: PitchInput) => void;
  onThank: (giftId: number, text: string, voice: Blob | null) => void;
  onLeave: () => void;
}) {
  const { kid, holdings } = state;
  const band = bandFor(kid.birth_year);
  const owned = holdings?.stocks.filter((s) => s.raw !== "0") ?? [];
  const savings = Number(holdings?.usdcMicro ?? 0);
  return (
    <>
      <header>
        <p className="text-5xl" aria-hidden>
          {kid.avatar}
        </p>
        <h1 className="mt-1 text-2xl font-bold">{night ? `Good night, ${kid.nickname} 🌙` : `Good morning, ${kid.nickname} ☀️`}</h1>
      </header>
      {!night && <MorningReport state={state} busy={busy} onThank={onThank} />}
      <section className={`rounded-2xl p-4 ${panel}`}>
        <p className="text-sm opacity-80">My savings (read live from Base)</p>
        <p className="text-3xl font-bold">{state.hasVault ? usd(savings) : "…"}</p>
        {owned.map((s) => (
          <p key={s.ticker}>
            {COMPANIES[s.ticker].emoji} I own {s.shares.toFixed(7).replace(/0+$/, "")} shares of {COMPANIES[s.ticker].name}
          </p>
        ))}
        {state.allowance && state.allowance.amountMicro !== "0" && (
          <p className="mt-1 text-sm opacity-80">🌙 Next allowance: {usd(state.allowance.amountMicro)}, while you sleep.</p>
        )}
      </section>
      <PitchForm
        kidName={kid.nickname}
        band={band}
        night={night}
        panel={panel}
        busy={busy}
        maxMicro={Math.min(kid.max_per_pitch_micro, savings)}
        onPitch={onPitch}
      />
      {state.pitches.length > 0 && (
        <section className={`flex flex-col gap-2 rounded-2xl p-4 ${panel}`}>
          <h2 className="font-semibold">My pitches</h2>
          {state.pitches.map((p) => (
            <article key={p.id} className="text-sm">
              <p>
                {COMPANIES[p.ticker].emoji} {usd(p.usdc_micro)} of {COMPANIES[p.ticker].name}: {pitchStatus(p, night)}
              </p>
              {p.txUrl && (
                <a href={p.txUrl} target="_blank" rel="noreferrer" className="underline">
                  See it on Basescan ↗
                </a>
              )}
            </article>
          ))}
        </section>
      )}
      <button type="button" onClick={onLeave} className="self-start text-sm underline">
        I&apos;m done, give the phone back
      </button>
      <p className="text-xs opacity-70">Kids can only ask. Only a grown-up can approve, with Face ID. Learning only, not financial advice.</p>
    </>
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
  panel,
  busy,
  maxMicro,
  onPitch,
}: {
  kidName: string;
  band: string;
  night: boolean;
  panel: string;
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
  const sub = night ? "bg-night-800" : "bg-sunrise-50";

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

  if (maxMicro < 10_000) return <p className={`rounded-2xl p-4 ${panel}`}>When your allowance lands, you can pitch a company to your parent here.</p>;

  const amountMicro = Number(amount) * 1e6;
  return (
    <section className={`flex flex-col gap-3 rounded-2xl p-4 ${panel}`}>
      <h2 className="text-lg font-semibold">{night ? "🌙 Bedtime pitch" : "Pitch a company"}</h2>
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
            className={`rounded-xl p-3 ${pick === t ? "ring-2 ring-star" : ""} ${night ? "bg-night-800" : "bg-sunrise-100"}`}
          >
            {COMPANIES[t].emoji} {COMPANIES[t].name}
          </button>
        ))}
      </div>
      {pick && card && (
        <dl className={`space-y-1 rounded-xl p-3 text-sm ${sub}`}>
          <dt className="font-semibold">What it does</dt>
          <dd>{card.whatItDoes}</dd>
          <dt className="font-semibold">How it makes money</dt>
          <dd>{card.howItMakesMoney}</dd>
          <dt className="font-semibold">One thing to watch</dt>
          <dd>{card.oneThingToWatch}</dd>
          <p className="pt-1 text-xs opacity-70">
            {card.source === "ai" ? "Written live by Claude (AI)" : "Written with Claude (AI) while building Allowance,"} for ages {band.replace("-", "–")}. Learning only,
            not financial advice.
          </p>
        </dl>
      )}
      {pick && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!coach) void askCoach();
            else onPitch({ ticker: pick, why, amount: Number(amount), coachQ: coach.question, coachA: answer });
          }}
        >
          <label htmlFor="why" className="font-semibold">
            Why do you like {COMPANIES[pick].name}?
          </label>
          <textarea id="why" rows={3} maxLength={280} value={why} readOnly={!!coach} onChange={(e) => setWhy(e.target.value)} className="rounded-xl bg-white p-3 text-ink" />
          <label className="flex items-center gap-2">
            How much? $
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-24 rounded-lg bg-white p-2 text-ink" />
            <span className="text-xs opacity-70">up to {usd(maxMicro)}</span>
          </label>
          {coach && (
            <div className={`flex flex-col gap-2 rounded-xl p-3 ${sub}`}>
              <p className="text-xs font-semibold uppercase tracking-wide">🧑‍🏫 Pitch coach</p>
              <p className="font-semibold">{coach.question}</p>
              <textarea aria-label="Your answer to the coach" rows={2} maxLength={280} value={answer} onChange={(e) => setAnswer(e.target.value)} className="rounded-xl bg-white p-3 text-ink" />
              <p className="text-xs opacity-70">
                {coach.source === "ai" ? "Asked live by Claude (AI)." : "Question written with Claude (AI) while building Allowance."} The coach never says what to buy.
              </p>
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !why.trim() || (!!coach && !answer.trim()) || !(amountMicro > 0) || amountMicro > maxMicro}
            className="rounded-xl bg-star px-4 py-3 font-semibold text-night-950 disabled:opacity-60"
          >
            {!coach ? "Next: one question from the coach" : `Send to my parent${night ? " (they'll see it at breakfast)" : ""}`}
          </button>
          <p className="text-xs opacity-70">{kidName}, you can only ask. Your parent decides.</p>
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
      <div className="rounded-2xl bg-gradient-to-b from-sunrise-300 to-sunrise-100 p-5 text-ink">
        <h2 className="text-2xl font-bold">Your Morning Report</h2>
        <p className="text-sm">What arrived in the last 24 hours, straight from Base.</p>
      </div>
      {empty && <p className="rounded-2xl bg-white p-4">A quiet night. Check back tomorrow morning!</p>}
      {r.gifts.map((g) => (
        <article key={g.id} className="rounded-2xl bg-white p-4 text-ink">
          <p className="text-lg font-semibold">
            🎁{" "}
            {g.kind === "group_settled"
              ? `Your family chipped in together for ${usd(g.usdcMicro)} of ${g.ticker ? COMPANIES[g.ticker].name : "shares"}!`
              : `${g.gifterName ?? "Someone in your family"} sent you a slice of ${g.ticker ? COMPANIES[g.ticker].name : "a company"} while you slept.`}
          </p>
          {(g.occasion || g.message) && (
            <p className="text-sm opacity-80">
              {g.occasion}
              {g.message ? `: “${g.message}”` : ""}
            </p>
          )}
          <a href={g.txUrl} target="_blank" rel="noreferrer" className="text-sm underline">
            See it on Basescan ↗
          </a>
          {g.thanked ? (
            <p className="mt-2 text-sm">💌 Thank-you sent. They&apos;ll see it when they open their gift link.</p>
          ) : (
            <form
              className="mt-3 flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onThank(g.id, texts[g.id] ?? "", voices[g.id] ?? null);
              }}
            >
              <label htmlFor={`ty-${g.id}`} className="text-sm font-semibold">
                Say thank you
              </label>
              <input
                id={`ty-${g.id}`}
                maxLength={280}
                value={texts[g.id] ?? ""}
                placeholder="Thank you so much! 🧡"
                onChange={(e) => setTexts((t) => ({ ...t, [g.id]: e.target.value }))}
                className="rounded-xl border border-sunrise-300 p-3"
              />
              <VoiceRecorder onChange={(b) => setVoices((v) => ({ ...v, [g.id]: b }))} />
              <button
                type="submit"
                disabled={busy || (!(texts[g.id] ?? "").trim() && !voices[g.id])}
                className="rounded-xl bg-sunrise-500 px-4 py-3 font-semibold text-white disabled:opacity-60"
              >
                💌 Send thank-you
              </button>
            </form>
          )}
        </article>
      ))}
      {r.approved.map((p) => {
        const change = scoreOf(p.id);
        return (
          <article key={p.id} className="rounded-2xl bg-white p-4 text-ink">
            <p className="text-lg font-semibold">✅ Your {COMPANIES[p.ticker].name} pitch was approved! You own a piece of it.</p>
            {p.matchPct > 0 && (
              <p className="text-sm font-semibold text-sunrise-700">
                💛 Matched {p.matchPct}%: +{usd(p.matchMicro)} on top of your {usd(p.usdcMicro)}.
              </p>
            )}
            {change !== null && (
              <p className="text-sm">
                📈 Since you picked it: {Math.abs(change) < 0.05 ? "about the same" : `${change > 0 ? "up" : "down"} ${Math.abs(change).toFixed(2)}%`}.{" "}
                <span className="opacity-70">(Live price on Base. Prices go up and down.)</span>
              </p>
            )}
            {p.txUrl && (
              <a href={p.txUrl} target="_blank" rel="noreferrer" className="text-sm underline">
                See it on Basescan ↗
              </a>
            )}
          </article>
        );
      })}
      {r.allowances.map((a, i) => (
        <article key={i} className="rounded-2xl bg-white p-4 text-ink">
          <p className="text-lg font-semibold">🌙 Your allowance landed at midnight: {usd(a.usdcMicro)}</p>
          {a.txUrl && (
            <a href={a.txUrl} target="_blank" rel="noreferrer" className="text-sm underline">
              See it on Basescan ↗
            </a>
          )}
        </article>
      ))}
      {r.dividends.map((d) => (
        <article key={d.ticker} className="rounded-2xl bg-white p-4 text-ink">
          <p className="text-lg font-semibold">💸 {COMPANIES[d.ticker].name} paid you overnight! Your shares grew.</p>
        </article>
      ))}
      {r.leaderboard.length > 1 && (
        <section className="rounded-2xl bg-white p-4 text-ink" aria-labelledby="lb">
          <h3 id="lb" className="font-semibold">
            🏆 Family leaderboard
          </h3>
          <p className="text-xs opacity-70">Points for pitches (1), approvals (2) and thank-yous (1). Never for money made.</p>
          <ol className="mt-2 flex flex-col gap-1">
            {r.leaderboard.map((l, i) => (
              <li key={l.nickname} className={`flex justify-between rounded-lg px-2 py-1 ${l.me ? "bg-sunrise-100 font-semibold" : ""}`}>
                <span>
                  {i + 1}. {l.avatar} {l.nickname}
                </span>
                <span className="text-sm">{l.points} pts</span>
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
          className="rounded-xl bg-night-900 px-4 py-3 font-semibold text-moon"
        >
          📸 Save my Morning Report as an image
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
