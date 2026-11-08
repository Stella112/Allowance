"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, parseAbi, stringToHex, type EIP1193Provider } from "viem";
import { base } from "viem/chains";

type Ticker = "AAPL" | "NVDA";
type LinkInfo = {
  kid: { nickname: string; avatar: string; chainKidId: `0x${string}`; timezone: string; graduated: boolean };
  vault: `0x${string}`;
  usdc: `0x${string}`;
  tokens: Record<Ticker, `0x${string}`>;
  kind: "single" | "group";
  ticker: Ticker | null;
  suggestedMicro: number | null;
  group: { id: string; status: string; target: string; raised: string; mine: string | null } | null;
  occasions: string[];
  maxGiftMicro: number;
  gifts: { id: number; kind: string; gifter_name: string | null; occasion: string | null; ticker: Ticker | null; usdc_micro: number; txUrl: string; created_at: string }[];
  thanks: { gift_id: number; message: string | null; created_at: string; voiceUrl: string | null }[];
};

const COMPANIES: Record<Ticker, { name: string; emoji: string }> = { AAPL: { name: "Apple", emoji: "🍎" }, NVDA: { name: "Nvidia", emoji: "🎮" } };
// Each occasion has a themed message and card style.
const THEMES: Record<string, { emoji: string; message: (n: string) => string; card: string }> = {
  Birthday: { emoji: "🎂", message: (n) => `Happy birthday, ${n}!`, card: "from-pink-300 to-sunrise-100" },
  "Good grades": { emoji: "📚", message: (n) => `Well done on your results, ${n}!`, card: "from-emerald-200 to-sunrise-100" },
  Christmas: { emoji: "🎄", message: (n) => `Merry Christmas, ${n}!`, card: "from-red-300 to-emerald-100" },
  Eid: { emoji: "🌙", message: (n) => `Eid Mubarak, ${n}!`, card: "from-indigo-200 to-sunrise-100" },
  Graduation: { emoji: "🎓", message: (n) => `So proud of you, ${n}!`, card: "from-sky-200 to-sunrise-100" },
  "Just because": { emoji: "💛", message: (n) => `Thinking of you, ${n}.`, card: "from-sunrise-300 to-sunrise-100" },
};

const usd = (micro: number | string | null | undefined) => {
  const n = Number(micro ?? 0);
  return `$${(n / 1e6).toFixed(n % 10_000 === 0 ? 2 : 3)}`;
};
const timeIn = (tz: string | undefined) => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: tz });
const hourIn = (tz: string) => Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: tz }));
const cityOf = (tz: string) => tz.split("/").pop()!.replace(/_/g, " ");

const erc20 = parseAbi(["function approve(address spender, uint256 amount) returns (bool)", "function allowance(address owner, address spender) view returns (uint256)", "function balanceOf(address) view returns (uint256)"]);
const vaultAbi = parseAbi([
  "function depositGift(bytes32 kidId, address token, uint256 usdcAmount, uint256 minOut, uint256 deadline, bytes32 gifterTag) returns (uint256)",
  "function contributeToGroupGift(uint256 id, uint256 amount, bytes32 gifterTag)",
  "function refundGroupGift(uint256 id)",
]);

function provider(): EIP1193Provider | null {
  return typeof window !== "undefined" ? ((window as unknown as { ethereum?: EIP1193Provider }).ethereum ?? null) : null;
}

async function api<T>(code: string, query = "", body?: unknown): Promise<T> {
  const res = await fetch(
    `/api/gift/${code}${query}`,
    body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json as T;
}

export default function GiftApp({ code }: { code: string }) {
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [ticker, setTicker] = useState<Ticker>("AAPL");
  const [amount, setAmount] = useState("1");
  const [occasion, setOccasion] = useState("Birthday");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");

  const load = useCallback(async (who?: string | null) => {
    const r = await api<LinkInfo>(code, who ? `?who=${who}` : "");
    setInfo(r);
    if (r.ticker) setTicker(r.ticker);
  }, [code]);

  useEffect(() => {
    api<LinkInfo>(code)
      .then((r) => {
        setInfo(r);
        if (r.ticker) setTicker(r.ticker);
        if (r.suggestedMicro) setAmount(String(r.suggestedMicro / 1e6));
      })
      .catch((e) => setError(e.message));
  }, [code]);

  if (!info) return <p className="p-8 text-moon-dim">{error ?? "Loading the gift…"}</p>;

  const kidName = info.kid.nickname;
  const kidTz = info.kid.timezone;
  const kidHour = hourIn(kidTz);
  const asleep = kidHour >= 19 || kidHour < 6;
  const theme = THEMES[occasion] ?? THEMES["Just because"];
  const msg = message || theme.message(kidName);
  const micro = Math.round(Number(amount) * 1e6);
  const g = info.group;
  const open = g?.status === "open";
  const company = info.kind === "group" ? info.ticker ?? ticker : ticker;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const m = (e as { shortMessage?: string; message: string }).shortMessage ?? (e as Error).message;
      setError(/rejected|denied/i.test(m) ? "You cancelled in your wallet. Nothing was sent." : m);
    } finally {
      setBusy(null);
    }
  };

  const connect = () =>
    run("Connecting your wallet…", async () => {
      const eth = provider();
      if (!eth) throw new Error("No wallet found in this browser. Open this link inside the Coinbase Wallet or MetaMask app, or add their browser extension.");
      const [addr] = (await eth.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2105" }] });
      } catch {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: "0x2105", chainName: "Base", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://mainnet.base.org"], blockExplorerUrls: ["https://basescan.org"] }],
        });
      }
      setAccount(addr);
      await load(addr);
    });

  const clients = () => {
    const eth = provider()!;
    return {
      wallet: createWalletClient({ account: account!, chain: base, transport: custom(eth) }),
      reader: createPublicClient({ chain: base, transport: custom(eth) }),
    };
  };

  const ensureApproval = async (need: bigint) => {
    const { wallet, reader } = clients();
    const balance = await reader.readContract({ address: info.usdc, abi: erc20, functionName: "balanceOf", args: [account!] });
    if (balance < need) throw new Error(`Your wallet has ${usd(balance.toString())} USDC on Base. You need ${usd(need.toString())}.`);
    const allowance = await reader.readContract({ address: info.usdc, abi: erc20, functionName: "allowance", args: [account!, info.vault] });
    if (allowance < need) {
      setBusy("Step 1 of 2: allow the family vault to take exactly this amount of USDC…");
      const hash = await wallet.writeContract({ address: info.usdc, abi: erc20, functionName: "approve", args: [info.vault, need] });
      await reader.waitForTransactionReceipt({ hash });
    }
  };

  const tag = stringToHex((name || "A relative").slice(0, 31), { size: 32 });

  const send = () =>
    run("Preparing your gift…", async () => {
      if (!(micro >= 10_000 && micro <= info.maxGiftMicro)) throw new Error(`Gifts are from $0.01 to ${usd(info.maxGiftMicro)}.`);
      const need = BigInt(micro);
      await ensureApproval(need);
      const { wallet, reader } = clients();
      setBusy(info.kind === "group" ? "Chipping in on Base…" : "Sending your gift on Base…");
      let hash: `0x${string}`;
      if (info.kind === "group") {
        hash = await wallet.writeContract({ address: info.vault, abi: vaultAbi, functionName: "contributeToGroupGift", args: [BigInt(g!.id), need, tag] });
      } else {
        const q = await api<{ minOut: string; deadline: number }>(code, `?quote=1&ticker=${ticker}&amount=${micro / 1e6}`);
        hash = await wallet.writeContract({
          address: info.vault,
          abi: vaultAbi,
          functionName: "depositGift",
          args: [info.kid.chainKidId, info.tokens[ticker], need, BigInt(q.minOut), BigInt(q.deadline), tag],
        });
      }
      await reader.waitForTransactionReceipt({ hash });
      setInfo(await api<LinkInfo>(code, "", { action: "record", txHash: hash, gifterName: name, occasion, message: msg, who: account }));
      setSent(`https://basescan.org/tx/${hash}`);
    });

  const refund = () =>
    run("Taking your part back…", async () => {
      const { wallet, reader } = clients();
      const hash = await wallet.writeContract({ address: info.vault, abi: vaultAbi, functionName: "refundGroupGift", args: [BigInt(g!.id)] });
      await reader.waitForTransactionReceipt({ hash });
      await load(account);
    });

  if (info.kid.graduated) return <p className="p-8">{kidName} has graduated and now has their own wallet. Ask the family for their new gift link.</p>;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-8">
      <header className={`rounded-2xl bg-gradient-to-b ${theme.card} p-5 text-ink`}>
        <p className="text-5xl" aria-hidden>
          {info.kid.avatar} {theme.emoji}
        </p>
        <h1 className="mt-2 text-2xl font-bold">
          {info.kind === "group" ? `Chip in for ${kidName}'s ${COMPANIES[company].name} gift` : `Send ${kidName} a slice of a real company`}
        </h1>
        <p className="text-sm">Real Coinbase tokenized shares on Base, held in {kidName}&apos;s family vault.</p>
      </header>

      <section className="grid grid-cols-2 gap-2 rounded-2xl bg-night-900 p-4 text-center">
        <div>
          <p className="text-xs text-moon-dim">Your time</p>
          <p className="text-2xl font-bold">{timeIn(undefined)}</p>
        </div>
        <div>
          <p className="text-xs text-moon-dim">{cityOf(kidTz)}</p>
          <p className="text-2xl font-bold">{timeIn(kidTz)}</p>
        </div>
        <p className="col-span-2 text-sm">
          {asleep ? `It's ${timeIn(kidTz)} in ${cityOf(kidTz)}. ${kidName} will wake up to your gift. 🌙` : `It's daytime in ${cityOf(kidTz)}. ${kidName} will see it in their next Morning Report.`}
        </p>
      </section>

      {info.thanks.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl bg-sunrise-100 p-4 text-ink">
          {info.thanks.map((t, i) => (
            <div key={i} className="flex flex-col gap-1">
              {t.message && <p>💌 {kidName} says: “{t.message}”</p>}
              {t.voiceUrl && (
                <>
                  <p className="text-sm font-semibold">🎙️ {kidName} sent you a voice note</p>
                  <audio controls src={t.voiceUrl} className="h-10 max-w-full" />
                </>
              )}
            </div>
          ))}
        </section>
      )}

      {g && (
        <section className="rounded-2xl bg-night-900 p-4">
          <div className="h-3 overflow-hidden rounded-full bg-night-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round((Number(g.raised) / Number(g.target)) * 100))} aria-label="Raised so far">
            <div className="h-full bg-star" style={{ width: `${Math.min(100, (Number(g.raised) / Number(g.target)) * 100)}%` }} />
          </div>
          <p className="mt-1 text-sm">
            {usd(g.raised)} of {usd(g.target)} raised · {g.status === "open" ? "open" : g.status === "settled" ? "turned into shares 🎉" : "called off"}
          </p>
          {g.mine && Number(g.mine) > 0 && (g.status === "open" || g.status === "cancelled") && (
            <button type="button" disabled={!!busy} onClick={refund} className="mt-2 text-sm underline disabled:opacity-60">
              Take my {usd(g.mine)} back
            </button>
          )}
        </section>
      )}

      {sent ? (
        <section className="rounded-2xl bg-sunrise-100 p-5 text-ink">
          <p className="text-lg font-semibold">🎉 Sent! {asleep ? `${kidName} will wake up to it.` : `${kidName} will see it in their Morning Report.`}</p>
          <a href={sent} target="_blank" rel="noreferrer" className="mt-2 inline-block underline">
            See it on Basescan ↗
          </a>
          <p className="mt-2 text-sm">Come back to this link later to read {kidName}&apos;s thank-you.</p>
        </section>
      ) : info.kind === "group" && !open ? null : (
        <form
          className="flex flex-col gap-3 rounded-2xl bg-night-900 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!account) connect();
            else send();
          }}
        >
          {info.kind === "single" && info.ticker && (
            <p className="rounded-xl bg-night-800 p-3 font-semibold">
              {COMPANIES[info.ticker].emoji} The family picked {COMPANIES[info.ticker].name} for {kidName}.
            </p>
          )}
          {info.kind === "single" && !info.ticker && (
            <fieldset>
              <legend className="font-semibold">Pick a company</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(Object.keys(COMPANIES) as Ticker[]).map((t) => (
                  <button key={t} type="button" aria-pressed={ticker === t} onClick={() => setTicker(t)} className={`rounded-xl p-3 ${ticker === t ? "bg-night-700 ring-2 ring-star" : "bg-night-800"}`}>
                    {COMPANIES[t].emoji} {COMPANIES[t].name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset>
            <legend className="font-semibold">Amount (USDC)</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {["1", "2", "5"].map((a) => (
                <button key={a} type="button" aria-pressed={amount === a} onClick={() => setAmount(a)} className={`rounded-xl px-4 py-2 ${amount === a ? "bg-star font-semibold text-night-950" : "bg-night-800"}`}>
                  ${a}
                </button>
              ))}
              <label className="flex items-center gap-1">
                <span className="sr-only">Other amount</span>$
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-20 rounded-lg bg-white p-2 text-ink" />
              </label>
            </div>
          </fieldset>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Occasion</span>
            <select value={occasion} onChange={(e) => setOccasion(e.target.value)} className="rounded-xl bg-white p-3 text-ink">
              {info.occasions.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Your name (what {kidName} calls you)</span>
            <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Aunty Funmi" className="rounded-xl bg-white p-3 text-ink" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Message</span>
            <input value={message} maxLength={200} placeholder={theme.message(kidName)} onChange={(e) => setMessage(e.target.value)} className="rounded-xl bg-white p-3 text-ink" />
          </label>

          <div className="rounded-xl bg-night-800 p-3 text-sm">
            <p className="font-semibold">Before you sign</p>
            <p>Amount: {Number.isFinite(micro) && micro > 0 ? usd(micro) : "…"} USDC · Network: Base</p>
            <p>
              {kidName} gets: {info.kind === "group" ? `a share of the family's ${COMPANIES[company].name} gift when it's turned into shares` : `a slice of a real Coinbase tokenized ${COMPANIES[ticker].name} share`}
            </p>
            <p className="break-all">
              Goes to: {kidName}&apos;s family vault{" "}
              <a className="underline" href={`https://basescan.org/address/${info.vault}`} target="_blank" rel="noreferrer">
                {info.vault}
              </a>
            </p>
            {account && <p className="break-all">From: your wallet {account}</p>}
            {info.kind === "group" && <p className="text-moon-dim">Your USDC waits in the vault until the family gift is complete. You can take it back until then.</p>}
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-900">
              {error}
            </p>
          )}
          {busy && <p aria-live="polite" className="text-sm">⏳ {busy}</p>}
          <button type="submit" disabled={!!busy} className="rounded-xl bg-star px-4 py-3 font-semibold text-night-950 disabled:opacity-60">
            {!account ? "Connect my wallet" : info.kind === "group" ? `Chip in ${usd(micro)}` : `Send ${usd(micro)} of ${COMPANIES[ticker].name}`}
          </button>
          <p className="text-xs text-moon-dim">You pay a small network fee in ETH on Base. Allowance never asks for your seed phrase or password. Learning gift only, not financial advice.</p>
        </form>
      )}
    </main>
  );
}
