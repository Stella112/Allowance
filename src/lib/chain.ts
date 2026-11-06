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
]);
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

export async function releaseAllowance(kidId: Hash) {
  const vault = config.demoVault();
  const [, , nextReleaseAt] = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "allowanceOf", args: [kidId] });
  const wait = Number(nextReleaseAt) * 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait + 2_000)); // the contract allows one release per period
  const receipt = await send(() =>
    wallet().writeContract({ address: vault, abi: vaultAbi, functionName: "releaseAllowance", args: [kidId] }),
  );
  return { hash: receipt.transactionHash };
}

/** Buys shares for an approved pitch. matchBps (0..10000) is the parent's match, paid from the family pool. */
export async function pitchBuy(kidId: Hash, ticker: Ticker, usdcMicro: bigint, matchBps = 0n) {
  const total = usdcMicro + (usdcMicro * matchBps) / 10_000n;
  const { minOut } = await quoteMinOut(ticker, total);
  const receipt = await send(() =>
    wallet().writeContract({
      address: config.demoVault(),
      abi: vaultAbi,
      functionName: "approvePitchBuy",
      args: [kidId, STOCKS[ticker].token, usdcMicro, matchBps, minOut, deadline()],
    }),
  );
  const [ev] = parseEventLogs({ abi: vaultAbi, eventName: "PitchBought", logs: receipt.logs });
  return { hash: receipt.transactionHash, tokensOut: ev?.args.tokensOut ?? 0n, matchUsdc: ev?.args.matchUsdc ?? 0n };
}

/** Demo gift: the relayer wallet plays Aunty Funmi and pays from its own USDC. */
export async function giftFromRelayer(kidId: Hash, ticker: Ticker, usdcMicro: bigint, gifterTag: Hash) {
  const vault = config.demoVault();
  const usdc = config.usdc();
  const current = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: "allowance", args: [relayerAddress(), vault] });
  if (current < usdcMicro) {
    // Approve a small, bounded amount ($1) so most gifts need one transaction.
    await send(() => wallet().writeContract({ address: usdc, abi: erc20Abi, functionName: "approve", args: [vault, 1_000_000n] }));
  }
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
export async function kidHoldings(kidId: Hash): Promise<Holdings> {
  const vault = config.demoVault();
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
