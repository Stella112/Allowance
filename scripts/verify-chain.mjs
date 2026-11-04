// Read-only Phase 0 checks against Base mainnet. Sends NO transactions and needs no keys.
// Usage: pnpm verify:chain   (uses BASE_RPC_URL if set, else the public, rate-limited https://mainnet.base.org)
import { toFunctionSelector } from "viem";

const RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
let id = 0;
async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}
const word = (hex) => hex.toLowerCase().replace("0x", "").padStart(64, "0");
const uint = (n) => BigInt(n).toString(16).padStart(64, "0");
const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
const addrOf = (ret) => "0x" + ret.slice(26);

// Sources for every address: docs/VERIFIED.md
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CL_FACTORY = "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef";
const ROUTER = "0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F";
const QUOTER = "0x514c8B5f54112481E28028F1166Bd78501089259";
const POLICY_REGISTRY = "0x8453000000000000000000000000000000000002";
const TICK_SPACING = 10;
const STOCKS = {
  AAPLc: { token: "0xb200000000000000000000C2e324d24d7eEcd1fb", pool: "0xA3b1E3f9747065e2073722Ff4c9027d3eA4994F0" },
  NVDAc: { token: "0xb20000000000000000000078ee7ce2fE4908108C", pool: "0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9" },
};
const SCOPES = {
  TRANSFER_SENDER: "0xb81736c875ab819dd97f59f2a6542cfb731ad52b4ae15a6f24df2fb02b0327f5",
  TRANSFER_RECEIVER: "0x8a4b3fa2d8b921852bc0089c6ef0958aa6961897be36fd731330fe2cd23f8363",
  TRANSFER_EXECUTOR: "0x10be5173aff2a44e748bd9acd8b19fe34689581398a9db7ba2fb671e786ff7d8",
};
const S = {
  factory: toFunctionSelector("factory()"),
  getPool: toFunctionSelector("getPool(address,address,int24)"),
  quote: toFunctionSelector("quoteExactInputSingle((address,address,uint256,int24,uint160))"),
  policyId: toFunctionSelector("policyId(bytes32)"),
  isAuthorized: toFunctionSelector("isAuthorized(uint64,address)"),
  multiplier: toFunctionSelector("uiMultiplier()"),
  decimals: toFunctionSelector("decimals()"),
};

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
};

const chainId = parseInt(await rpc("eth_chainId", []), 16);
check("chain id is 8453 (Base mainnet)", chainId === 8453, `got ${chainId}`);
check("router.factory() == Slipstream factory", addrOf(await call(ROUTER, S.factory)) === CL_FACTORY.toLowerCase());
check("quoter.factory() == Slipstream factory", addrOf(await call(QUOTER, S.factory)) === CL_FACTORY.toLowerCase());

const fresh = "0x" + [...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, "0")).join("");
for (const [sym, { token, pool }] of Object.entries(STOCKS)) {
  const dec = Number(BigInt(await call(token, S.decimals)));
  check(`${sym} decimals`, dec === 8, `got ${dec}`);
  const mult = Number(BigInt(await call(token, S.multiplier))) / 1e18;
  console.log(`      ${sym} uiMultiplier = ${mult}`);
  const got = addrOf(await call(CL_FACTORY, S.getPool + word(USDC) + word(token) + uint(TICK_SPACING)));
  check(`${sym} factory.getPool(USDC, ${sym}, ${TICK_SPACING}) == pool`, got === pool.toLowerCase(), got);
  for (const [scope, hash] of Object.entries(SCOPES)) {
    const pid = BigInt(await call(token, S.policyId + hash.slice(2)));
    const ok = BigInt(await call(POLICY_REGISTRY, S.isAuthorized + uint(pid) + word(fresh))) === 1n;
    check(`${sym} ${scope} policy ${pid} authorizes a fresh address`, ok);
  }
  let base;
  for (const usd of [0.25, 1, 5]) {
    const ret = await call(QUOTER, S.quote + word(USDC) + word(token) + uint(Math.round(usd * 1e6)) + uint(TICK_SPACING) + uint(0));
    const out = Number(BigInt("0x" + ret.slice(2, 66))) / 10 ** dec;
    const price = usd / out;
    base ??= price;
    const impact = (price / base - 1) * 100;
    check(`${sym} $${usd} buy within 2% of the $0.25 price`, impact < 2, `${out.toFixed(8)} ${sym} @ $${price.toFixed(2)} (${impact.toFixed(2)}%)`);
  }
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
