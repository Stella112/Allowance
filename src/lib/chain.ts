import "server-only";
import {
  createPublicClient,
  createWalletClient,
  fallback,
  http,
  nonceManager,
  parseAbi,
  parseEventLogs,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { config } from "./config";
import { STOCKS, type Ticker } from "./stocks";

// Minimal ABIs. Sources: contracts/src/FamilyVault.sol; Slipstream IQuoterV2; Base B20 docs.
const vaultAbi = parseAbi([
  "function setAllowance(bytes32 kidId, uint128 amount, uint64 period)",
  "function releaseAllowance(bytes32 kidId)",
  "function approvePitchBuy(bytes32 kidId, address token, uint256 usdcAmount, uint256 matchBps, uint256 minOut, uint256 deadline) returns (uint256)",
  "function depositGift(bytes32 kidId, address token, uint256 usdcAmount, uint256 minOut, uint256 deadline, bytes32 gifterTag) returns (uint256)",
  "function kidUsdc(bytes32) view returns (uint256)",
  "function kidTokens(bytes32, address) view returns (uint256)",
  "function familyUsdc() view returns (uint256)",
  "function allowanceOf(bytes32) view returns (uint128 amount, uint64 period, uint64 nextReleaseAt)",
  "event PitchBought(bytes32 indexed kidId, address indexed token, uint256 kidUsdcSpent, uint256 matchUsdc, uint256 tokensOut)",
  "event GiftReceived(bytes32 indexed kidId, address indexed token, address indexed from, bytes32 gifterTag, uint256 usdcIn, uint256 tokensOut)",
  "event AllowanceReleased(bytes32 indexed kidId, uint256 amount, uint256 nextReleaseAt)",
  // v2: group gifts and graduation
  "function openGroupGift(bytes32 kidId, address token, uint256 target) returns (uint256)",
  "function contributeToGroupGift(uint256 id, uint256 amount, bytes32 gifterTag)",
  "function settleGroupGift(uint256 id, uint256 minOut, uint256 deadline) returns (uint256)",
  "function cancelGroupGift(uint256 id)",
  "function refundGroupGift(uint256 id)",
  "function groupGifts(uint256) view returns (bytes32 kidId, address token, address organizer, uint8 status, uint256 target, uint256 raised)",
  "function contributionOf(uint256, address) view returns (uint256)",
  "function graduate(bytes32 kidId, address to)",
  "function graduatedTo(bytes32) view returns (address)",
  "function canReceive(address token, address to) view returns (bool)",
  "event GroupGiftOpened(uint256 indexed id, bytes32 indexed kidId, address indexed token, address organizer, uint256 target)",
  "event GroupGiftSettled(uint256 indexed id, bytes32 indexed kidId, address indexed token, uint256 usdcIn, uint256 tokensOut)",
  "event GroupGiftContributed(uint256 indexed id, address indexed from, bytes32 gifterTag, uint256 amount, uint256 raised)",
  "event GroupGiftRefunded(uint256 indexed id, address indexed to, uint256 amount)",
  "event Graduated(bytes32 indexed kidId, address indexed to, uint256 usdc)",
]);

/** The vault ABI for other server code (this module is server-only). */
export { vaultAbi };
const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);
const b20Abi = parseAbi(["function uiMultiplier() view returns (uint256)"]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, int24 tickSpacing, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

const transport = () =>
  fallback(config.rpcUrls.map((u) => http(u, { retryCount: 3, retryDelay: 400, timeout: 20_000 })));

// Batch reads into one multicall and poll for receipts every second (Base blocks are ~2s).
export const publicClient = createPublicClient({ chain: base, transport: transport(), batch: { multicall: true }, pollingInterval: 1_000 });

let _wallet: ReturnType<typeof makeWallet> | null = null;
function makeWallet() {
  const account = privateKeyToAccount(config.relayerKey(), { nonceManager });
  return createWalletClient({ account, chain: base, transport: transport() });
}
const wallet = () => (_wallet ??= makeWallet());
export const relayerAddress = () => wallet().account.address;

const SLIPPAGE_BPS = 100n; // 1%
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 600);

async function send(fn: () => Promise<Hash>) {
  const t0 = Date.now();
  const hash = await fn();
  const t1 = Date.now();
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000, pollingInterval: 1_000 });
  console.log(`[chain] tx ${hash.slice(0, 10)} submit ${t1 - t0}ms, confirm ${Date.now() - t1}ms`);
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return receipt;
}

export async function quoteMinOut(ticker: Ticker, usdcMicro: bigint) {
  const { result } = await publicClient.simulateContract({
    address: config.quoter(),
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: config.usdc(),
        tokenOut: STOCKS[ticker].token,
        amountIn: usdcMicro,
        tickSpacing: STOCKS[ticker].tickSpacing,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  const quoted = result[0];
  return { quoted, minOut: (quoted * (10_000n - SLIPPAGE_BPS)) / 10_000n };
}

/** First allowance for a fresh demo kid: schedule it, then release it (2 txs). */
export async function setAndReleaseAllowance(kidId: Hash) {
  const vault = config.demoVault();
  const d = config.demo;
  await send(() =>
    wallet().writeContract({ address: vault, abi: vaultAbi, functionName: "setAllowance", args: [kidId, d.allowanceMicro, d.allowancePeriodSec] }),
  );
  return releaseAllowance(kidId);
}

export async function releaseAllowance(kidId: Hash, vault: `0x${string}` = config.demoVault()) {
  const [, , nextReleaseAt] = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "allowanceOf", args: [kidId] });
  const wait = Number(nextReleaseAt) * 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait + 2_000)); // the contract allows one release per period
  const receipt = await send(() =>
    wallet().writeContract({ address: vault, abi: vaultAbi, functionName: "releaseAllowance", args: [kidId] }),
  );
  return { hash: receipt.transactionHash };
}

/** Buys shares for an approved pitch. matchBps (0..10000) is the parent's match, paid from the family pool. */
export async function pitchBuy(kidId: Hash, ticker: Ticker, usdcMicro: bigint, matchBps = 0n, vault: `0x${string}` = config.demoVault()) {
  const total = usdcMicro + (usdcMicro * matchBps) / 10_000n;
  const { minOut } = await quoteMinOut(ticker, total);
  const receipt = await send(() =>
    wallet().writeContract({
      address: vault,
      abi: vaultAbi,
      functionName: "approvePitchBuy",
      args: [kidId, STOCKS[ticker].token, usdcMicro, matchBps, minOut, deadline()],
    }),
  );
  const [ev] = parseEventLogs({ abi: vaultAbi, eventName: "PitchBought", logs: receipt.logs });
  return { hash: receipt.transactionHash, tokensOut: ev?.args.tokensOut ?? 0n, matchUsdc: ev?.args.matchUsdc ?? 0n };
}

/** Makes sure the vault may pull `amount` USDC from the relayer. Approves a small, bounded $1 at a time. */
async function ensureUsdcApproval(amount: bigint) {
  const vault = config.demoVault();
  const usdc = config.usdc();
  const current = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: "allowance", args: [relayerAddress(), vault] });
  if (current < amount) {
    await send(() => wallet().writeContract({ address: usdc, abi: erc20Abi, functionName: "approve", args: [vault, 1_000_000n] }));
  }
}

/** Demo gift: the relayer wallet plays Aunty Funmi and pays from its own USDC. */
export async function giftFromRelayer(kidId: Hash, ticker: Ticker, usdcMicro: bigint, gifterTag: Hash) {
  const vault = config.demoVault();
  await ensureUsdcApproval(usdcMicro);
  const { minOut } = await quoteMinOut(ticker, usdcMicro);
  const receipt = await send(() =>
    wallet().writeContract({
      address: vault,
      abi: vaultAbi,
      functionName: "depositGift",
      args: [kidId, STOCKS[ticker].token, usdcMicro, minOut, deadline(), gifterTag],
    }),
  );
  const [ev] = parseEventLogs({ abi: vaultAbi, eventName: "GiftReceived", logs: receipt.logs });
  return { hash: receipt.transactionHash, tokensOut: ev?.args.tokensOut ?? 0n };
}

export type Holdings = {
  usdcMicro: string;
  stocks: { ticker: Ticker; raw: string; shares: number; multiplier: string }[];
};

/** Each stock token's current uiMultiplier (WAD). A rise means a real dividend was paid. */
export async function uiMultipliers(): Promise<Record<Ticker, string>> {
  const tickers = Object.keys(STOCKS) as Ticker[];
  const values = await Promise.all(
    tickers.map((t) => publicClient.readContract({ address: STOCKS[t].token, abi: b20Abi, functionName: "uiMultiplier" })),
  );
  return Object.fromEntries(tickers.map((t, i) => [t, values[i].toString()])) as Record<Ticker, string>;
}

/** Reads the kid's balances from the chain (the source of truth). */
export async function kidHoldings(kidId: Hash, vault: `0x${string}` = config.demoVault()): Promise<Holdings> {
  const tickers = Object.keys(STOCKS) as Ticker[];
  const [usdc, ...rest] = await Promise.all([
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "kidUsdc", args: [kidId] }),
    ...tickers.flatMap((t) => [
      publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "kidTokens", args: [kidId, STOCKS[t].token] }),
      publicClient.readContract({ address: STOCKS[t].token, abi: b20Abi, functionName: "uiMultiplier" }),
    ]),
  ]);
  return {
    usdcMicro: usdc.toString(),
    stocks: tickers.map((t, i) => {
      const raw = rest[i * 2];
      const mult = rest[i * 2 + 1];
      // shares = raw (8 decimals) x multiplier (WAD)
      return { ticker: t, raw: raw.toString(), shares: Number((raw * mult) / 10n ** 18n) / 1e8, multiplier: mult.toString() };
    }),
  };
}

/** Funds left for the demo: the vault's family pool and the relayer's USDC (for gifts). */
export async function demoFunds() {
  const [pool, relayerUsdc] = await Promise.all([
    publicClient.readContract({ address: config.demoVault(), abi: vaultAbi, functionName: "familyUsdc" }),
    publicClient.readContract({ address: config.usdc(), abi: erc20Abi, functionName: "balanceOf", args: [relayerAddress()] }),
  ]);
  return { pool, relayerUsdc };
}

// ---------------------------------------------------------------- v2 reads

export const GROUP_STATUS = ["none", "open", "settled", "cancelled"] as const;

export async function groupGift(vault: `0x${string}`, id: bigint) {
  const [kidId, token, organizer, status, target, raised] = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "groupGifts",
    args: [id],
  });
  return { kidId, token, organizer, status: GROUP_STATUS[status] ?? "none", target, raised };
}

/** Whether a wallet passes the stock's transfer rules (the same check graduation runs on-chain). */
export async function canReceive(vault: `0x${string}`, token: `0x${string}`, to: `0x${string}`) {
  return publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "canReceive", args: [token, to] });
}

// ---------------------------------------------------------------- v2 writes (demo: the relayer plays every relative)

/** Opens a group gift for a kid. Returns the on-chain group gift id. */
export async function openGroupGiftTx(kidId: Hash, ticker: Ticker, targetMicro: bigint, vault: `0x${string}` = config.demoVault()) {
  const receipt = await send(() =>
    wallet().writeContract({
      address: vault,
      abi: vaultAbi,
      functionName: "openGroupGift",
      args: [kidId, STOCKS[ticker].token, targetMicro],
    }),
  );
  const [ev] = parseEventLogs({ abi: vaultAbi, eventName: "GroupGiftOpened", logs: receipt.logs });
  if (!ev) throw new Error("GroupGiftOpened event missing");
  return { hash: receipt.transactionHash, id: ev.args.id };
}

/** Chips USDC into a group gift's escrow. */
export async function contributeTx(id: bigint, usdcMicro: bigint, gifterTag: Hash) {
  await ensureUsdcApproval(usdcMicro);
  const receipt = await send(() =>
    wallet().writeContract({ address: config.demoVault(), abi: vaultAbi, functionName: "contributeToGroupGift", args: [id, usdcMicro, gifterTag] }),
  );
  return { hash: receipt.transactionHash };
}

/** Turns a group gift's escrow into shares for the kid (the relayer is the organizer, so it can close it any time). */
export async function settleGroupGiftTx(id: bigint, ticker: Ticker, raisedMicro: bigint, vault: `0x${string}` = config.demoVault()) {
  const { minOut } = await quoteMinOut(ticker, raisedMicro);
  const receipt = await send(() =>
    wallet().writeContract({ address: vault, abi: vaultAbi, functionName: "settleGroupGift", args: [id, minOut, deadline()] }),
  );
  const [ev] = parseEventLogs({ abi: vaultAbi, eventName: "GroupGiftSettled", logs: receipt.logs });
  return { hash: receipt.transactionHash, tokensOut: ev?.args.tokensOut ?? 0n };
}

/** Calls off a group gift and takes the relayer's contributions back. */
export async function cancelAndRefundTx(id: bigint) {
  const vault = config.demoVault();
  const cancel = await send(() => wallet().writeContract({ address: vault, abi: vaultAbi, functionName: "cancelGroupGift", args: [id] }));
  const refund = await send(() => wallet().writeContract({ address: vault, abi: vaultAbi, functionName: "refundGroupGift", args: [id] }));
  return { cancelHash: cancel.transactionHash, refundHash: refund.transactionHash };
}

/** Sends all of a kid's shares and savings to `to` (owner only; in the demo the relayer owns the vault). */
export async function graduateTx(kidId: Hash, to: `0x${string}`) {
  const vault = config.demoVault();
  for (const t of Object.keys(STOCKS) as Ticker[]) {
    if (!(await canReceive(vault, STOCKS[t].token, to))) throw new Error(`${to} can't receive ${t} under its transfer rules`);
  }
  const receipt = await send(() => wallet().writeContract({ address: vault, abi: vaultAbi, functionName: "graduate", args: [kidId, to] }));
  return { hash: receipt.transactionHash };
}

export async function graduatedTo(kidId: Hash, vault: `0x${string}` = config.demoVault()) {
  const to = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "graduatedTo", args: [kidId] });
  return to === "0x0000000000000000000000000000000000000000" ? null : to;
}

// ---------------------------------------------------------------- real families

const factoryAbi = parseAbi(["function vaultOf(address) view returns (address)"]);

/** The family vault a parent's wallet created through our factory (read from the chain), or null. */
export async function vaultOfParent(wallet: `0x${string}`) {
  const v = await publicClient.readContract({ address: config.factory(), abi: factoryAbi, functionName: "vaultOf", args: [wallet] });
  return v === "0x0000000000000000000000000000000000000000" ? null : v;
}

/** A family vault's settings that the app shows and checks. */
export async function vaultInfo(vault: `0x${string}`) {
  const [owner, operator, familyUsdc] = await Promise.all([
    publicClient.readContract({ address: vault, abi: parseAbi(["function owner() view returns (address)"]), functionName: "owner" }),
    publicClient.readContract({ address: vault, abi: parseAbi(["function operator() view returns (address)"]), functionName: "operator" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "familyUsdc" }),
  ]);
  return { owner, operator, familyUsdc };
}

export async function allowanceSchedule(vault: `0x${string}`, kidId: Hash) {
  const [amount, period, nextReleaseAt] = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "allowanceOf", args: [kidId] });
  return { amount, period, nextReleaseAt };
}

export async function usdcBalance(address: `0x${string}`) {
  return publicClient.readContract({ address: config.usdc(), abi: erc20Abi, functionName: "balanceOf", args: [address] });
}

// ---------------------------------------------------------------- gifts paid from a relative's own wallet

/**
 * Reads a confirmed transaction and returns the gift or group-gift contribution it made to `vault` for `kidId`
 * (or for group gift `groupId`). The server records gifts only from what the chain says, never from the browser.
 */
export async function readGiftTx(hash: Hash, vault: `0x${string}`, kidId: Hash, groupId: bigint | null) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000, pollingInterval: 1_000 });
  if (receipt.status !== "success") throw new Error("Transaction reverted");
  const logs = receipt.logs.filter((l) => l.address.toLowerCase() === vault.toLowerCase());
  const [gift] = parseEventLogs({ abi: vaultAbi, eventName: "GiftReceived", logs }).filter((e) => e.args.kidId.toLowerCase() === kidId.toLowerCase());
  if (gift) {
    return { kind: "gift" as const, from: gift.args.from, token: gift.args.token, usdcIn: gift.args.usdcIn, tokensOut: gift.args.tokensOut };
  }
  if (groupId !== null) {
    const [c] = parseEventLogs({ abi: vaultAbi, eventName: "GroupGiftContributed", logs }).filter((e) => e.args.id === groupId);
    if (c) return { kind: "contribution" as const, from: c.args.from, token: null, usdcIn: c.args.amount, tokensOut: 0n };
  }
  return null;
}

export async function contributionOf(vault: `0x${string}`, groupId: bigint, who: `0x${string}`) {
  return publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "contributionOf", args: [groupId, who] });
}
