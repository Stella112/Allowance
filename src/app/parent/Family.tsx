"use client";

import { useSendUserOperation } from "@coinbase/cdp-hooks";
import { startAuthentication } from "@simplewebauthn/browser";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData, parseAbi } from "viem";

// ------------------------------------------------------------------ types (mirror /api/parent/family)

type Ticker = "AAPL" | "NVDA";
type Holdings = { usdcMicro: string; stocks: { ticker: Ticker; raw: string; shares: number }[] } | null;
type KidRow = {
  id: string;
  nickname: string;
  avatar: string;
  birth_year: number;
  chain_kid_id: `0x${string}`;
  paused: boolean;
  max_per_pitch_micro: number;
  max_per_month_micro: number;
  match_pct: number;
  allowance_micro: number;
  allowance_period: "weekly" | "monthly";
  periodSec: string;
  holdings: Holdings;
  allowance: { amountMicro: string; periodSec: string; nextReleaseAt: number } | null;
};
type PitchRow = {
  id: number;
  kid_id: string;
  ticker: Ticker;
  why: string;
  coach_q: string | null;
  coach_a: string | null;
  usdc_micro: number;
  match_pct: number;
  match_micro: number;
  status: "pending" | "sending" | "confirmed" | "declined" | "failed";
  tokens_raw: string | null;
  txUrl: string | null;
};
type FamilyState = {
  parent: { email: string | null; wallet: `0x${string}`; vault: `0x${string}` | null; timezone: string };
  factory: `0x${string}`;
  usdc: `0x${string}`;
  walletUsdcMicro: string | null;
  familyUsdcMicro: string | null;
  kids: KidRow[];
  pitches: PitchRow[];
};

const COMPANY: Record<Ticker, string> = { AAPL: "🍎 Apple", NVDA: "🎮 Nvidia" };
const AVATARS = ["🦁", "🐼", "🦊", "🐯", "🐸", "🦄", "🐙", "🚀", "⚽", "🎨"];
const usd = (micro: number | string | null | undefined) => {
  const n = Number(micro ?? 0);
  return `$${(n / 1e6).toFixed(n % 10_000 === 0 ? 2 : 3)}`;
};

const factoryAbi = parseAbi(["function createVault() returns (address)"]);
const vaultAbi = parseAbi(["function setAllowance(bytes32 kidId, uint128 amount, uint64 period)", "function deposit(uint256 amount)"]);
const erc20Abi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);

async function family(body?: unknown): Promise<FamilyState> {
  const res = await fetch("/api/parent/family", body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ dashboard

export default function Family() {
  const [state, setState] = useState<FamilyState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { sendUserOperation } = useSendUserOperation();

  const refresh = useCallback(async () => setState(await family()), []);
  useEffect(() => {
    family().then(setState).catch((e) => setError(e.message));
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

  /** Sends calls from the parent's smart account with Coinbase paying the gas, then polls until `done` says it landed. */
  const sponsored = async (calls: { to: `0x${string}`; data: `0x${string}` }[], done: (s: FamilyState) => boolean, confirm?: () => Promise<FamilyState>) => {
    if (!state) return;
    try {
      await sendUserOperation({ evmSmartAccount: state.parent.wallet, network: "base", calls, useCdpPaymaster: true });
    } catch (e) {
      throw new Error(
        `Coinbase couldn't send this for you (${(e as Error).message}). If it says the gas wasn't sponsored, your wallet needs a few cents of ETH on Base: ${state.parent.wallet}`,
      );
    }
    for (let i = 0; i < 30; i++) {
      await wait(3000);
      const next = await (confirm ? confirm().catch(() => null) : family().catch(() => null));
      if (next && done(next)) {
        setState(next);
        return;
      }
    }
    throw new Error("It's taking longer than usual to land on Base. Refresh in a minute.");
  };

  if (!state) return <p className="text-moon-dim">{error ?? "Loading your family…"}</p>;

  const pending = state.pitches.filter((p) => p.status === "pending");

  return (
    <div className="flex flex-col gap-4">
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

      {pending.length > 0 && (
        <Inbox
          state={state}
          pitches={pending}
          busy={!!busy}
          onApprove={(p) =>
            run("Waiting for Face ID, then buying real shares on Base…", async () => {
              const optionsJSON = await family({ action: "approve-options", pitchId: p.id });
              let response;
              try {
                response = await startAuthentication({ optionsJSON: optionsJSON as never });
              } catch {
                throw new Error("Face ID was cancelled. Nothing was approved.");
              }
              setState(await family({ action: "approve", pitchId: p.id, response }));
            })
          }
          onDecline={(p) => run("Saying not this time…", async () => setState(await family({ action: "decline", pitchId: p.id })))}
        />
      )}

      {state.kids.length === 0 ? (
        <AddKid busy={!!busy} first onAdd={(k) => run(`Adding ${k.nickname}…`, async () => setState(await family({ action: "add-kid", ...k })))} />
      ) : !state.parent.vault ? (
        <section className="flex flex-col gap-3 rounded-2xl bg-night-900 p-5">
          <h2 className="text-lg font-semibold">Create your family vault on Base</h2>
          <p className="text-sm text-moon-dim">
            Your vault holds the family&apos;s USDC and shares, tracked per kid. Only you own it. Allowance&apos;s helper can only do what you approve, inside the limits
            set in the contract ($5 per transaction, $20 per kid per month, $100 in total).
          </p>
          <p className="text-sm">Cost: free for you. Allowance pays the network fee (a few cents).</p>
          <button
            type="button"
            disabled={!!busy}
            onClick={() =>
              run("Creating your family vault on Base…", () =>
                sponsored(
                  [{ to: state.factory, data: encodeFunctionData({ abi: factoryAbi, functionName: "createVault" }) }],
                  (s) => !!s.parent.vault,
                  () => family({ action: "confirm-vault" }),
                ),
              )
            }
            className="rounded-xl bg-star px-4 py-3 font-semibold text-night-950 disabled:opacity-60"
          >
            🏦 Create family vault
          </button>
        </section>
      ) : (
        <>
          <Pool state={state} busy={!!busy} onDeposit={(micro) =>
            run("Adding money to the family pool…", () =>
              sponsored(
                [
                  { to: state.usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [state.parent.vault!, micro] }) },
                  { to: state.parent.vault!, data: encodeFunctionData({ abi: vaultAbi, functionName: "deposit", args: [micro] }) },
                ],
                (s) => BigInt(s.familyUsdcMicro ?? 0) >= BigInt(state.familyUsdcMicro ?? 0) + micro,
              ),
            )
          } />
          {state.kids.map((k) => (
            <KidCard
              key={k.id}
              kid={k}
              busy={!!busy}
              onSave={(patch) => run(`Saving ${k.nickname}'s settings…`, async () => setState(await family({ action: "kid-settings", kidId: k.id, ...patch })))}
              onResetPin={(pin) => run("Resetting the PIN…", async () => setState(await family({ action: "reset-pin", kidId: k.id, pin })))}
              onSetAllowance={(micro, period) =>
                run(`Setting ${k.nickname}'s allowance on Base…`, async () => {
                  await family({ action: "kid-settings", kidId: k.id, allowance: Number(micro) / 1e6, allowancePeriod: period });
                  const periodSec = period === "weekly" ? 7n * 86_400n : 30n * 86_400n;
                  await sponsored(
                    [{ to: state.parent.vault!, data: encodeFunctionData({ abi: vaultAbi, functionName: "setAllowance", args: [k.chain_kid_id, micro, periodSec] }) }],
                    (s) => s.kids.find((x) => x.id === k.id)?.allowance?.amountMicro === micro.toString(),
                  );
                })
              }
            />
          ))}
          <AddKid busy={!!busy} onAdd={(k) => run(`Adding ${k.nickname}…`, async () => setState(await family({ action: "add-kid", ...k })))} />
          <Link href="/kid" className="rounded-xl bg-night-800 px-4 py-3 text-center font-semibold">
            👦🏾 Hand the phone to a kid (switch profile)
          </Link>
          <button type="button" onClick={() => refresh().catch(() => {})} className="self-start text-sm underline">
            Refresh
          </button>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ pieces

function Inbox({
  state,
  pitches,
  busy,
  onApprove,
  onDecline,
}: {
  state: FamilyState;
  pitches: PitchRow[];
  busy: boolean;
  onApprove: (p: PitchRow) => void;
  onDecline: (p: PitchRow) => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-sunrise-50 p-5 text-ink">
      <h2 className="text-lg font-semibold">☀️ Waiting for you</h2>
      {pitches.map((p) => {
        const kid = state.kids.find((k) => k.id === p.kid_id);
        const match = kid ? Math.floor((p.usdc_micro * kid.match_pct) / 100) : 0;
        return (
          <article key={p.id} className="rounded-xl bg-white p-4">
            <p className="font-semibold">
              {kid?.avatar} {kid?.nickname} wants to buy {usd(p.usdc_micro)} of {COMPANY[p.ticker]}
            </p>
            <p className="mt-1">“{p.why}”</p>
            {p.coach_q && (
              <p className="mt-2 rounded-lg bg-sunrise-50 p-2 text-sm">
                🧑‍🏫 Coach asked: {p.coach_q}
                {p.coach_a && (
                  <>
                    <br />
                    {kid?.nickname} answered: “{p.coach_a}”
                  </>
                )}
              </p>
            )}
            <p className="mt-2 text-xs opacity-80">
              Approving buys {usd(p.usdc_micro + match)} of a real Coinbase tokenized share on Base: {usd(p.usdc_micro)} from {kid?.nickname}&apos;s savings
              {match ? ` + ${usd(match)} from your pool (${kid?.match_pct}% match)` : ""}. Held in your family vault.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={() => onApprove(p)} className="rounded-xl bg-night-900 px-3 py-3 font-semibold text-moon disabled:opacity-60">
                🔐 Approve with Face ID
              </button>
              <button type="button" disabled={busy} onClick={() => onDecline(p)} className="rounded-xl bg-sunrise-100 px-3 py-3 font-semibold disabled:opacity-60">
                Not this time
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function Pool({ state, busy, onDeposit }: { state: FamilyState; busy: boolean; onDeposit: (micro: bigint) => void }) {
  const [amount, setAmount] = useState("1");
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-night-900 p-5">
      <h2 className="text-lg font-semibold">🏦 Family pool</h2>
      <p className="text-3xl font-bold">{usd(state.familyUsdcMicro)}</p>
      <p className="text-sm text-moon-dim">Pays allowances and your matches. Read live from your vault on Base.</p>
      <p className="break-all text-xs text-moon-dim">
        Vault:{" "}
        <a className="underline" href={`https://basescan.org/address/${state.parent.vault}`} target="_blank" rel="noreferrer">
          {state.parent.vault}
        </a>
      </p>
      <p className="mt-2 text-sm">
        Your wallet has {usd(state.walletUsdcMicro)} USDC.{" "}
        {Number(state.walletUsdcMicro ?? 0) === 0 && (
          <span className="text-moon-dim">
            Send USDC on Base to <span className="break-all font-mono">{state.parent.wallet}</span> to add money.
          </span>
        )}
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const micro = BigInt(Math.round(Number(amount) * 1e6));
          if (micro > 0n) onDeposit(micro);
        }}
      >
        <label className="sr-only" htmlFor="deposit">
          Amount to add in US dollars
        </label>
        <input id="deposit" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28 rounded-xl bg-white p-3 text-ink" />
        <button type="submit" disabled={busy || Number(state.walletUsdcMicro ?? 0) === 0} className="flex-1 rounded-xl bg-star px-4 font-semibold text-night-950 disabled:opacity-60">
          Add to pool
        </button>
      </form>
    </section>
  );
}

function KidCard({
  kid,
  busy,
  onSave,
  onResetPin,
  onSetAllowance,
}: {
  kid: KidRow;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  onResetPin: (pin: string) => void;
  onSetAllowance: (micro: bigint, period: "weekly" | "monthly") => void;
}) {
  const [allowance, setAllowance] = useState(String(kid.allowance_micro / 1e6 || 1));
  const [period, setPeriod] = useState(kid.allowance_period);
  const [match, setMatch] = useState(kid.match_pct);
  const [maxPitch, setMaxPitch] = useState(String(kid.max_per_pitch_micro / 1e6));
  const [maxMonth, setMaxMonth] = useState(String(kid.max_per_month_micro / 1e6));
  const [pin, setPin] = useState("");
  const age = new Date().getUTCFullYear() - kid.birth_year;
  const owned = kid.holdings?.stocks.filter((s) => s.raw !== "0") ?? [];
  const onChain = kid.allowance && kid.allowance.amountMicro !== "0";

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-night-900 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {kid.avatar} {kid.nickname}, {age}
        </h2>
        {kid.paused && <span className="rounded-full bg-red-200 px-2 py-1 text-xs text-red-900">Paused</span>}
      </div>
      <p>
        Savings: <span className="font-semibold">{usd(kid.holdings?.usdcMicro)}</span>
        {owned.map((s) => (
          <span key={s.ticker} className="ml-2">
            · {COMPANY[s.ticker]} {s.shares.toFixed(7).replace(/0+$/, "")}
          </span>
        ))}
      </p>

      <fieldset className="flex flex-col gap-2 rounded-xl bg-night-800 p-3">
        <legend className="px-1 text-sm font-semibold">Allowance (lands at midnight)</legend>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor={`al-${kid.id}`}>
            Allowance amount in US dollars
          </label>
          <input id={`al-${kid.id}`} inputMode="decimal" value={allowance} onChange={(e) => setAllowance(e.target.value)} className="w-24 rounded-lg bg-white p-2 text-ink" />
          <select aria-label="How often" value={period} onChange={(e) => setPeriod(e.target.value as "weekly" | "monthly")} className="rounded-lg bg-white p-2 text-ink">
            <option value="weekly">every week</option>
            <option value="monthly">every month</option>
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSetAllowance(BigInt(Math.round(Number(allowance) * 1e6)), period)}
            className="rounded-lg bg-star px-3 py-2 font-semibold text-night-950 disabled:opacity-60"
          >
            Save on Base
          </button>
        </div>
        <p className="text-xs text-moon-dim">
          {onChain
            ? `On Base: ${usd(kid.allowance!.amountMicro)} every ${Number(kid.allowance!.periodSec) >= 30 * 86_400 ? "month" : "week"}. Next one can land after ${new Date(kid.allowance!.nextReleaseAt * 1000).toLocaleString()}.`
            : "Not set on Base yet."}{" "}
          It moves from the family pool into {kid.nickname}&apos;s savings. It doesn&apos;t buy anything by itself.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-xl bg-night-800 p-3">
        <legend className="px-1 text-sm font-semibold">Limits and match</legend>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex flex-col gap-1">
            Max per pitch ($)
            <input inputMode="decimal" value={maxPitch} onChange={(e) => setMaxPitch(e.target.value)} className="rounded-lg bg-white p-2 text-ink" />
          </label>
          <label className="flex flex-col gap-1">
            Max per month ($)
            <input inputMode="decimal" value={maxMonth} onChange={(e) => setMaxMonth(e.target.value)} className="rounded-lg bg-white p-2 text-ink" />
          </label>
        </div>
        <div role="group" aria-label="Match" className="grid grid-cols-4 gap-1">
          {[0, 25, 50, 100].map((m) => (
            <button key={m} type="button" aria-pressed={match === m} onClick={() => setMatch(m)} className={`rounded-lg px-2 py-2 text-sm ${match === m ? "bg-star font-semibold text-night-950" : "bg-night-700"}`}>
              {m}% match
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onSave({ matchPct: match, maxPerPitch: Number(maxPitch), maxPerMonth: Number(maxMonth) })}
            className="rounded-lg bg-star px-3 py-2 font-semibold text-night-950 disabled:opacity-60"
          >
            Save limits
          </button>
          <button type="button" disabled={busy} onClick={() => onSave({ paused: !kid.paused })} className="rounded-lg bg-night-700 px-3 py-2 disabled:opacity-60">
            {kid.paused ? "Unpause profile" : "Pause profile"}
          </button>
        </div>
      </fieldset>

      <form
        className="flex flex-wrap items-center gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          onResetPin(pin);
          setPin("");
        }}
      >
        <label htmlFor={`pin-${kid.id}`}>New PIN</label>
        <input id={`pin-${kid.id}`} inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="w-20 rounded-lg bg-white p-2 text-center text-ink" />
        <button type="submit" disabled={busy || pin.length !== 4} className="rounded-lg bg-night-700 px-3 py-2 disabled:opacity-60">
          Reset PIN
        </button>
      </form>
    </section>
  );
}

function AddKid({ busy, first, onAdd }: { busy: boolean; first?: boolean; onAdd: (k: { nickname: string; birthYear: number; avatar: string; pin: string; consent: boolean }) => void }) {
  const [open, setOpen] = useState(!!first);
  const [nickname, setNickname] = useState("");
  const [birthYear, setBirthYear] = useState(String(new Date().getUTCFullYear() - 11));
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [pin, setPin] = useState("");
  const [consent, setConsent] = useState(false);
  const years = Array.from({ length: 12 }, (_, i) => new Date().getUTCFullYear() - 6 - i);

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-night-800 px-4 py-3 font-semibold">
        ➕ Add another child
      </button>
    );

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl bg-night-900 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd({ nickname, birthYear: Number(birthYear), avatar, pin, consent });
      }}
    >
      <h2 className="text-lg font-semibold">{first ? "Step 3: add your first child" : "Add a child"}</h2>
      <label className="flex flex-col gap-1">
        First name or nickname
        <input value={nickname} maxLength={20} onChange={(e) => setNickname(e.target.value)} className="rounded-xl bg-white p-3 text-ink" autoComplete="off" />
      </label>
      <label className="flex flex-col gap-1">
        Birth year
        <select value={birthYear} onChange={(e) => setBirthYear(e.target.value)} className="rounded-xl bg-white p-3 text-ink">
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Avatar</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {AVATARS.map((a) => (
            <button key={a} type="button" aria-pressed={avatar === a} aria-label={`Avatar ${a}`} onClick={() => setAvatar(a)} className={`rounded-xl p-2 text-2xl ${avatar === a ? "bg-night-700 ring-2 ring-star" : "bg-night-800"}`}>
              {a}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1">
        4-digit PIN for {nickname || "your child"}
        <input inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="w-32 rounded-xl bg-white p-3 text-center text-2xl tracking-widest text-ink" autoComplete="off" />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        <span>
          I&apos;m this child&apos;s parent or guardian, and I agree to Allowance storing only their nickname, birth year, avatar and a scrambled PIN. No email, phone,
          photo, school or surname. On Base they are an anonymous ID.
        </span>
      </label>
      <button type="submit" disabled={busy || !nickname.trim() || pin.length !== 4 || !consent} className="rounded-xl bg-star px-4 py-3 font-semibold text-night-950 disabled:opacity-60">
        Add {nickname || "child"}
      </button>
    </form>
  );
}
