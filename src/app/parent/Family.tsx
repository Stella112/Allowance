"use client";

import { useSendUserOperation } from "@coinbase/cdp-hooks";
import { startAuthentication } from "@simplewebauthn/browser";
import { Icon, TabBar } from "@/components/ui";
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
  graduated_to: string | null;
  graduation: { wallet: string | null } | null;
};
type Device = { id: string; kid_id: string; label: string; status: "pending" | "approved"; last_seen_at: string | null };
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
  giftLinks: { code: string; kid_id: string; kind: "single" | "group"; ticker: Ticker | null; target_micro: number | null }[];
  devices: Device[];
};

const COMPANY: Record<Ticker, string> = { AAPL: "🍎 Apple", NVDA: "🎮 Nvidia" };
const AVATARS = ["🦁", "🐼", "🦊", "🐯", "🐸", "🦄", "🐙", "🚀", "⚽", "🎨"];
const usd = (micro: number | string | null | undefined) => {
  const n = Number(micro ?? 0);
  return `$${(n / 1e6).toFixed(n % 10_000 === 0 ? 2 : 3)}`;
};

// Base mainnet paymaster endpoint from the CDP Portal (Onchain Tools > Paymaster). Its client key is meant for browsers.
const PAYMASTER_URL = process.env.NEXT_PUBLIC_CDP_PAYMASTER_URL || undefined;

const factoryAbi = parseAbi(["function createVault() returns (address)"]);
const vaultAbi = parseAbi([
  "function setAllowance(bytes32 kidId, uint128 amount, uint64 period)",
  "function deposit(uint256 amount)",
  "function graduate(bytes32 kidId, address to)",
]);
const erc20Abi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);

async function family<T = FamilyState>(body?: unknown): Promise<T> {
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
  const [gradLink, setGradLink] = useState<{ kidId: string; link: string } | null>(null);
  const [tab, setTab] = useState<"home" | "kids" | "gifts" | "devices">("home");
  const [invite, setInvite] = useState<{ kidId: string; code: string; link: string; qr: string } | null>(null);

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
      // Prefer the project's own paymaster URL from the CDP Portal (Onchain Tools > Paymaster) when it's set;
      // otherwise ask Coinbase to use the project's default CDP paymaster.
      await sendUserOperation(
        PAYMASTER_URL
          ? { evmSmartAccount: state.parent.wallet, network: "base", calls, paymasterUrl: PAYMASTER_URL }
          : { evmSmartAccount: state.parent.wallet, network: "base", calls, useCdpPaymaster: true },
      );
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

      {state.kids.length === 0 ? (
        <AddKid busy={!!busy} first onAdd={(k) => run(`Adding ${k.nickname}…`, async () => setState(await family({ action: "add-kid", ...k })))} />
      ) : !state.parent.vault ? (
        <section className="card flex flex-col gap-3">
          <h2 className="section-title">Create your family vault on Base</h2>
          <p className="text-sm text-moon-dim">
            Your vault holds the family&apos;s USDC and shares, tracked per kid. Only you own it. Allowance&apos;s helper can only do what you approve, inside the limits
            set in the contract ($5 per transaction, $20 per kid per month, $100 in total).
          </p>
          <p className="text-sm">Cost: free for you. Allowance sponsors the network fee through Coinbase.</p>
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
            className="btn"
          >
            Create family vault
          </button>
        </section>
      ) : (
        <>

          <TabBar
            label="Sections"
            active={tab}
            onPick={(id) => {
              setTab(id);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            items={[
              { id: "home", label: "Home", icon: <Icon name="home" />, badge: pending.length },
              { id: "kids", label: "Kids", icon: <Icon name="kids" /> },
              { id: "gifts", label: "Gifts", icon: <Icon name="gift" /> },
              { id: "devices", label: "Devices", icon: <Icon name="phone" /> },
            ]}
          />
          {tab === "home" && pending.length > 0 && (
        <Inbox
          state={state}
          pitches={pending}
          busy={!!busy}
          onApprove={(p) =>
            run("Waiting for Face ID, then buying real shares on Base…", async () => {
              const optionsJSON = await family<object>({ action: "approve-options", pitchId: p.id });
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

          {tab === "home" && (
            <div>
              <Pool
                state={state}
                busy={!!busy}
                onDeposit={(micro) =>
                  run("Adding money to the family pool…", () =>
                    sponsored(
                      [
                        { to: state.usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [state.parent.vault!, micro] }) },
                        { to: state.parent.vault!, data: encodeFunctionData({ abi: vaultAbi, functionName: "deposit", args: [micro] }) },
                      ],
                      (s) => BigInt(s.familyUsdcMicro ?? 0) >= BigInt(state.familyUsdcMicro ?? 0) + micro,
                    ),
                  )
                }
              />
              <section className="stack-lime">
                <p className="section-title">Send a gift link</p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex flex-1 -space-x-2">
                    {state.kids.map((k) => (
                      <span key={k.id} title={k.nickname} className="grid h-11 w-11 place-items-center rounded-full border-2 border-lime bg-white text-xl">
                        {k.avatar}
                      </span>
                    ))}
                  </div>
                  <button type="button" onClick={() => setTab("gifts")} className="btn btn-sm">
                    Share a link
                  </button>
                </div>
              </section>
              <section className="stack-sheet">
                <div className="row">
                  <h2 className="section-title flex-1">Your kids</h2>
                  <Link href="/kid" className="text-sm font-extrabold text-moon-dim">
                    Hand to a kid
                  </Link>
                </div>
                {state.kids.map((k) => (
                  <button key={k.id} type="button" onClick={() => setTab("kids")} className="row">
                    <span className="tile" aria-hidden>
                      {k.avatar}
                    </span>
                    <span className="flex-1 font-extrabold">{k.nickname}</span>
                    <span className="text-sm font-bold text-moon-dim">{usd(k.holdings?.usdcMicro)} saved</span>
                    <span className="text-moon-dim" aria-hidden>
                      ›
                    </span>
                  </button>
                ))}
              </section>
            </div>
          )}
          {tab === "kids" && <h1 className="screen-title">Kids</h1>}
          {tab === "kids" && state.kids.map((k) => (
            <KidCard
              key={k.id}
              kid={k}
              busy={!!busy}
              onSave={(patch) => run(`Saving ${k.nickname}'s settings…`, async () => setState(await family({ action: "kid-settings", kidId: k.id, ...patch })))}
              onResetPin={(pin) => run("Resetting the PIN…", async () => setState(await family({ action: "reset-pin", kidId: k.id, pin })))}
              onGraduateLink={() =>
                run("Making a graduation link…", async () => {
                  const r = await family<FamilyState & { graduateLink: string }>({ action: "graduate-invite", kidId: k.id });
                  setState(r);
                  setGradLink({ kidId: k.id, link: r.graduateLink });
                })
              }
              gradLink={gradLink?.kidId === k.id ? gradLink.link : null}
              onGraduate={() =>
                run(`Waiting for Face ID, then graduating ${k.nickname} on Base…`, async () => {
                  const optionsJSON = await family<object>({ action: "graduate-options", kidId: k.id });
                  let response;
                  try {
                    response = await startAuthentication({ optionsJSON: optionsJSON as never });
                  } catch {
                    throw new Error("Face ID was cancelled. Nothing moved.");
                  }
                  const ok = await family<{ chainKidId: `0x${string}`; wallet: `0x${string}` }>({ action: "graduate-check", kidId: k.id, response });
                  await sponsored(
                    [{ to: state.parent.vault!, data: encodeFunctionData({ abi: vaultAbi, functionName: "graduate", args: [ok.chainKidId, ok.wallet] }) }],
                    (s) => !!s.kids.find((x) => x.id === k.id)?.graduated_to,
                    () => family({ action: "graduate-confirm", kidId: k.id }),
                  );
                })
              }
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
          {tab === "gifts" && <GiftLinks
            state={state}
            busy={!!busy}
            onCreate={(input) =>
              run(input.kind === "group" ? "Opening the group gift on Base…" : "Making a gift link…", async () =>
                setState(await family({ action: "gift-link", ...input })),
              )
            }
          />}
          {tab === "devices" && <Devices
            state={state}
            busy={!!busy}
            invite={invite}
            onInvite={(kidId) =>
              run("Making a family code…", async () => {
                const r = await family<FamilyState & { invite: { code: string; link: string; qr: string } }>({ action: "invite", kidId });
                setState(r);
                setInvite({ kidId, ...r.invite });
              })
            }
            onSet={(deviceId, approve) =>
              run(approve ? "Approving the device…" : "Removing the device…", async () =>
                setState(await family({ action: approve ? "device-approve" : "device-remove", deviceId })),
              )
            }
          />}
          {tab === "kids" && <AddKid busy={!!busy} onAdd={(k) => run(`Adding ${k.nickname}…`, async () => setState(await family({ action: "add-kid", ...k })))} />}
          <button type="button" onClick={() => refresh().catch(() => {})} className="self-center text-sm font-extrabold text-moon-dim underline">
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
    <section className="flex flex-col gap-3">
      <h2 className="section-title">Waiting for you</h2>
      {pitches.map((p) => {
        const kid = state.kids.find((k) => k.id === p.kid_id);
        const match = kid ? Math.floor((p.usdc_micro * kid.match_pct) / 100) : 0;
        return (
          <article key={p.id} className="card flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="tile" aria-hidden>
                {kid?.avatar}
              </span>
              <div>
                <p className="font-extrabold leading-snug">
                  {kid?.nickname} wants {usd(p.usdc_micro)} of {COMPANY[p.ticker]}
                </p>
                <p className="mt-1 text-sm font-semibold text-moon-dim">“{p.why}”</p>
              </div>
            </div>
            {p.coach_q && (
              <p className="rounded-2xl bg-night-800 p-3 text-sm font-semibold">
                Coach asked: {p.coach_q}
                {p.coach_a && (
                  <>
                    <br />
                    {kid?.nickname} answered: “{p.coach_a}”
                  </>
                )}
              </p>
            )}
            <p className="note">
              Approving buys {usd(p.usdc_micro + match)} of a real Coinbase tokenized share on Base: {usd(p.usdc_micro)} from {kid?.nickname}&apos;s savings
              {match ? ` + ${usd(match)} from your pool (${kid?.match_pct}% match)` : ""}. Held in your family vault.
            </p>
            <button type="button" disabled={busy} onClick={() => onApprove(p)} className="btn">
              Approve with Face ID
            </button>
            <button type="button" disabled={busy} onClick={() => onDecline(p)} className="btn btn-soft">
              Not this time
            </button>
          </article>
        );
      })}
    </section>
  );
}

function Pool({ state, busy, onDeposit }: { state: FamilyState; busy: boolean; onDeposit: (micro: bigint) => void }) {
  const [amount, setAmount] = useState("1");
  const empty = Number(state.walletUsdcMicro ?? 0) === 0;
  return (
    <section className="stack-hero">
      <p className="eyebrow">Family pool</p>
      <p className="stat mt-1">{usd(state.familyUsdcMicro)}</p>
      <p className="eyebrow mt-1">Pays allowances and your matches</p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const micro = BigInt(Math.round(Number(amount) * 1e6));
          if (micro > 0n) onDeposit(micro);
        }}
      >
        <label className="sr-only" htmlFor="deposit">
          Amount to add in US dollars
        </label>
        <input id="deposit" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="field w-24 flex-none border-0 bg-white" />
        <button type="submit" disabled={busy || empty} className="btn flex-1">
          Add to pool
        </button>
      </form>
      <p className="eyebrow mt-3">
        Your wallet: {usd(state.walletUsdcMicro)} USDC ·{" "}
        <a className="underline" href={`https://basescan.org/address/${state.parent.vault}`} target="_blank" rel="noreferrer">
          View vault
        </a>
      </p>
      {empty && <p className="eyebrow mt-1 break-all">Send USDC on Base to {state.parent.wallet} to add money.</p>}
    </section>
  );
}

function KidCard({
  kid,
  busy,
  onSave,
  onResetPin,
  onSetAllowance,
  onGraduateLink,
  gradLink,
  onGraduate,
}: {
  kid: KidRow;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  onResetPin: (pin: string) => void;
  onSetAllowance: (micro: bigint, period: "weekly" | "monthly") => void;
  onGraduateLink: () => void;
  gradLink: string | null;
  onGraduate: () => void;
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
    <section className="card flex flex-col gap-4 pb-2">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-3 text-xl font-extrabold">
          <span className="tile" aria-hidden>{kid.avatar}</span>
          <span>
            {kid.nickname}
            <span className="block text-sm font-semibold text-moon-dim">Age {age}</span>
          </span>
        </h2>
        {kid.paused && <span className="rounded-full bg-red-200 px-2 py-1 text-xs text-red-900">Paused</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-night-800 p-3">
          <p className="eyebrow">Savings</p>
          <p className="text-lg font-extrabold">{usd(kid.holdings?.usdcMicro)}</p>
        </div>
        <div className="rounded-2xl bg-night-800 p-3">
          <p className="eyebrow">Shares</p>
          <p className="text-sm font-bold">{owned.length ? owned.map((s) => COMPANY[s.ticker].split(" ")[0]).join(" ") : "None yet"}</p>
        </div>
        <div className="rounded-2xl bg-night-800 p-3">
          <p className="eyebrow">Allowance</p>
          <p className="text-sm font-bold">{onChain ? `${usd(kid.allowance!.amountMicro)}/${Number(kid.allowance!.periodSec) >= 30 * 86_400 ? "mo" : "wk"}` : "Not set"}</p>
        </div>
      </div>

      <div>
        <details className="fold">
          <summary>Allowance</summary>
          <div className="fold-body">
            <label className="sr-only" htmlFor={`al-${kid.id}`}>
              Allowance amount in US dollars
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input id={`al-${kid.id}`} inputMode="decimal" value={allowance} onChange={(e) => setAllowance(e.target.value)} className="field" />
              <select aria-label="How often" value={period} onChange={(e) => setPeriod(e.target.value as "weekly" | "monthly")} className="field">
                <option value="weekly">every week</option>
                <option value="monthly">every month</option>
              </select>
            </div>
            <button type="button" disabled={busy} onClick={() => onSetAllowance(BigInt(Math.round(Number(allowance) * 1e6)), period)} className="btn">
              Save on Base
            </button>
            <p className="note">
              {onChain
                ? `On Base: ${usd(kid.allowance!.amountMicro)} every ${Number(kid.allowance!.periodSec) >= 30 * 86_400 ? "month" : "week"}. ${kid.allowance!.nextReleaseAt === 0 ? "The next one lands at tonight's midnight night shift (if the family pool has enough)." : `Next one lands after ${new Date(kid.allowance!.nextReleaseAt * 1000).toLocaleString()}.`}`
                : "Not set on Base yet."}{" "}
              It moves from the family pool into {kid.nickname}&apos;s savings. It doesn&apos;t buy anything by itself.
            </p>
          </div>
        </details>

        <details className="fold">
          <summary>Limits and match</summary>
          <div className="fold-body">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1.5">
                <span className="label">Max per pitch ($)</span>
                <input inputMode="decimal" value={maxPitch} onChange={(e) => setMaxPitch(e.target.value)} className="field" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="label">Max per month ($)</span>
                <input inputMode="decimal" value={maxMonth} onChange={(e) => setMaxMonth(e.target.value)} className="field" />
              </label>
            </div>
            <p className="label">Match</p>
            <div role="group" aria-label="Match" className="grid grid-cols-4 gap-1">
              {[0, 25, 50, 100].map((m) => (
                <button key={m} type="button" aria-pressed={match === m} onClick={() => setMatch(m)} className={`btn btn-sm px-1 ${match === m ? "" : "btn-soft"}`}>
                  {m}%
                </button>
              ))}
            </div>
            <button type="button" disabled={busy} onClick={() => onSave({ matchPct: match, maxPerPitch: Number(maxPitch), maxPerMonth: Number(maxMonth) })} className="btn">
              Save limits
            </button>
          </div>
        </details>

        <details className="fold">
          <summary>Profile and PIN</summary>
          <div className="fold-body">
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onResetPin(pin);
                setPin("");
              }}
            >
              <label className="label" htmlFor={`pin-${kid.id}`}>
                New PIN
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input id={`pin-${kid.id}`} inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="field text-center" />
                <button type="submit" disabled={busy || pin.length !== 4} className="btn btn-soft">
                  Reset PIN
                </button>
              </div>
            </form>
            <button type="button" disabled={busy} onClick={() => onSave({ paused: !kid.paused })} className="btn btn-soft">
              {kid.paused ? "Unpause profile" : "Pause profile"}
            </button>
          </div>
        </details>

        <details className="fold">
          <summary>Graduation at 18</summary>
          <div className="fold-body text-sm">
            {kid.graduated_to ? (
              <p>
                Graduated. Everything moved to {kid.nickname}&apos;s own wallet{" "}
                <a className="break-all underline" href={`https://basescan.org/address/${kid.graduated_to}#tokentxns`} target="_blank" rel="noreferrer">
                  {kid.graduated_to}
                </a>
                .
              </p>
            ) : kid.graduation?.wallet ? (
              <>
                <p className="break-all">
                  {kid.nickname} signed up with their own wallet: <span className="font-mono">{kid.graduation.wallet}</span>. It passed every stock&apos;s transfer rules.
                </p>
                <button type="button" disabled={busy} onClick={onGraduate} className="btn">
                  Graduate {kid.nickname} with Face ID
                </button>
                <p className="note">Moves every share and their savings out of the family vault in one transaction. You stay connected and can still gift.</p>
              </>
            ) : (
              <>
                <p className="text-moon-dim">
                  {kid.nickname} signs up with their own email and gets their own wallet. Then you move their shares to it. Their history comes with them.
                </p>
                {gradLink ? (
                  <p className="break-all">
                    Send {kid.nickname} this link (24 hours, one use): <span className="font-mono">{gradLink}</span>
                  </p>
                ) : (
                  <button type="button" disabled={busy} onClick={onGraduateLink} className="btn btn-soft">
                    Start graduation
                  </button>
                )}
              </>
            )}
          </div>
        </details>
      </div>
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
      <button type="button" onClick={() => setOpen(true)} className="btn btn-white shadow">
        Add another child
      </button>
    );

  return (
    <form
      className="card flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd({ nickname, birthYear: Number(birthYear), avatar, pin, consent });
      }}
    >
      <h2 className="section-title">{first ? "Step 3: add your first child" : "Add a child"}</h2>
      <label className="flex flex-col gap-1.5">
        <span className="label">First name or nickname</span>
        <input value={nickname} maxLength={20} onChange={(e) => setNickname(e.target.value)} className="field" autoComplete="off" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">Birth year</span>
        <select value={birthYear} onChange={(e) => setBirthYear(e.target.value)} className="field">
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="label">Avatar</legend>
        <div className="mt-1.5 grid grid-cols-5 gap-2">
          {AVATARS.map((a) => (
            <button key={a} type="button" aria-pressed={avatar === a} aria-label={`Avatar ${a}`} onClick={() => setAvatar(a)} className={`rounded-2xl p-2 text-2xl ${avatar === a ? "bg-lime" : "bg-night-800"}`}>
              {a}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1.5">
        <span className="label">4-digit PIN for {nickname || "your child"}</span>
        <input inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="field text-center text-2xl tracking-[0.5em]" autoComplete="off" />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        <span>
          I&apos;m this child&apos;s parent or guardian, and I agree to Allowance storing only their nickname, birth year, avatar and a scrambled PIN. No email, phone,
          photo, school or surname. On Base they are an anonymous ID.
        </span>
      </label>
      <button type="submit" disabled={busy || !nickname.trim() || pin.length !== 4 || !consent} className="btn">
        Add {nickname || "child"}
      </button>
    </form>
  );
}

function GiftLinks({
  state,
  busy,
  onCreate,
}: {
  state: FamilyState;
  busy: boolean;
  onCreate: (input: { kidId: string; kind: "single" | "group"; ticker?: Ticker; target?: number }) => void;
}) {
  const [kidId, setKidId] = useState(state.kids[0]?.id ?? "");
  const [kind, setKind] = useState<"single" | "group">("single");
  const [ticker, setTicker] = useState<Ticker | "">("AAPL");
  const [target, setTarget] = useState("1");
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const kidName = (id: string) => state.kids.find((k) => k.id === id)?.nickname ?? "your child";

  return (
    <>
      <h1 className="screen-title">Gift links</h1>
      <section className="card flex flex-col gap-3">
        <p className="text-sm font-semibold text-moon-dim">
          Share a link on WhatsApp. Relatives pay in USDC from their own wallet, and the vault turns it into <strong className="text-ink">real shares</strong> for your kid. No
          Allowance account needed. On a <strong className="text-ink">group gift</strong>, several relatives chip in toward a target.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="For which child" value={kidId} onChange={(e) => setKidId(e.target.value)} className="field">
            {state.kids.map((k) => (
              <option key={k.id} value={k.id}>
                {k.avatar} {k.nickname}
              </option>
            ))}
          </select>
          <select aria-label="Gift type" value={kind} onChange={(e) => setKind(e.target.value as "single" | "group")} className="field">
            <option value="single">Gift link</option>
            <option value="group">Group gift link</option>
          </select>
          <select aria-label="Company" value={ticker} onChange={(e) => setTicker(e.target.value as Ticker | "")} className="field">
            {kind === "single" && <option value="">Relative chooses</option>}
            <option value="AAPL">🍎 Apple</option>
            <option value="NVDA">🎮 Nvidia</option>
          </select>
          <input
            aria-label={kind === "group" ? "Target in US dollars" : "Amount in US dollars"}
            inputMode="decimal"
            value={target}
            placeholder={kind === "single" ? "They choose" : "Target $"}
            onChange={(e) => setTarget(e.target.value)}
            className="field"
          />
        </div>
        <button
          type="button"
          disabled={busy || !kidId}
          onClick={() =>
            onCreate(
              kind === "group"
                ? { kidId, kind, ticker: ticker || "AAPL", target: Number(target) }
                : { kidId, kind, ticker: ticker || undefined, target: target.trim() ? Number(target) : undefined },
            )
          }
          className="btn"
        >
          Make link
        </button>
      </section>
      {state.giftLinks.length > 0 && (
        <section className="card py-2">
          <h2 className="section-title pt-2">Your links</h2>
          <ul>
            {state.giftLinks.map((l) => {
              const url = `${origin}/gift/${l.code}`;
              const text = `Send ${kidName(l.kid_id)} a slice of a real company while they sleep 🌙 ${url}`;
              return (
                <li key={l.code} className="row flex-wrap">
                  <span className="tile" aria-hidden>
                    {l.kind === "group" ? "👨🏾‍👩🏾‍👧🏾" : "🎁"}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-extrabold">
                    {l.kind === "group"
                      ? `Group gift: ${l.ticker === "NVDA" ? "Nvidia" : "Apple"}, target ${usd(l.target_micro)}`
                      : `${l.target_micro ? usd(l.target_micro) : "Any amount"} of ${l.ticker === "NVDA" ? "Nvidia" : l.ticker === "AAPL" ? "Apple" : "their choice"}`}
                    <span className="block font-semibold text-moon-dim">For {kidName(l.kid_id)}</span>
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(url).then(() => setCopied(l.code));
                      }}
                      className="btn btn-sm btn-soft"
                    >
                      {copied === l.code ? "Copied ✓" : "Copy"}
                    </button>
                    <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="btn btn-sm bg-[#25D366] text-ink">
                      WhatsApp
                    </a>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

function Devices({
  state,
  busy,
  invite,
  onInvite,
  onSet,
}: {
  state: FamilyState;
  busy: boolean;
  invite: { kidId: string; code: string; link: string; qr: string } | null;
  onInvite: (kidId: string) => void;
  onSet: (deviceId: string, approve: boolean) => void;
}) {
  const kid = (id: string) => state.kids.find((k) => k.id === id);
  const pending = state.devices.filter((d) => d.status === "pending");
  const approved = state.devices.filter((d) => d.status === "approved");
  return (
    <>
      <h1 className="screen-title">Kids&apos; devices</h1>
      {pending.map((d) => (
        <div key={d.id} className="stack-lime mt-0 flex flex-col gap-3 pb-5">
          <span className="font-extrabold">
            {kid(d.kid_id)?.avatar} {kid(d.kid_id)?.nickname}&apos;s {d.label} wants to join. Approve?
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => onSet(d.id, true)} className="btn btn-sm">
              Approve
            </button>
            <button type="button" disabled={busy} onClick={() => onSet(d.id, false)} className="btn btn-sm btn-white">
              No
            </button>
          </div>
        </div>
      ))}
      {approved.length > 0 && (
        <section className="card py-2">
          {approved.map((d) => (
            <div key={d.id} className="row">
              <span className="tile" aria-hidden>
                {kid(d.kid_id)?.avatar}
              </span>
              <span className="min-w-0 flex-1 text-sm font-extrabold">
                {kid(d.kid_id)?.nickname}&apos;s {d.label}
                {d.last_seen_at && <span className="block font-semibold text-moon-dim">Last used {new Date(d.last_seen_at).toLocaleDateString()}</span>}
              </span>
              <button type="button" disabled={busy} onClick={() => onSet(d.id, false)} className="text-sm font-extrabold underline disabled:opacity-60">
                Remove
              </button>
            </div>
          ))}
        </section>
      )}
      <section className="card flex flex-col gap-3">
        <h2 className="section-title">Add a device</h2>
        <p className="text-sm font-semibold text-moon-dim">
          On this phone, use &quot;Hand to a kid&quot;. For their own tablet or a school phone, make a family code: they scan the QR code, open the link, or type the 6 characters at
          /join. Codes work once and last 24 hours, and you approve every new device.
        </p>
        {state.kids
          .filter((k) => !k.graduated_to)
          .map((k) => (
            <button key={k.id} type="button" disabled={busy} onClick={() => onInvite(k.id)} className="btn btn-soft">
              Family code for {k.avatar} {k.nickname}
            </button>
          ))}
        {invite && (
          <div className="flex flex-col items-center gap-2 rounded-3xl bg-night-800 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL QR code generated on our server */}
            <img src={invite.qr} alt={`QR code to join as ${kid(invite.kidId)?.nickname}`} width={200} height={200} className="rounded-2xl" />
            <p className="font-mono text-3xl tracking-[0.3em]">{invite.code}</p>
            <p className="note break-all text-center">{invite.link}</p>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Join our family on Allowance: ${invite.link} (code ${invite.code})`)}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm bg-[#25D366] text-ink"
            >
              Send on WhatsApp
            </a>
          </div>
        )}
      </section>
    </>
  );
}
