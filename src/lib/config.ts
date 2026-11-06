import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
}

const addr = (name: string) => required(name) as `0x${string}`;

export const config = {
  // Official public Base RPC; BASE_RPC_URL (optional) is tried first if set.
  rpcUrls: [process.env.BASE_RPC_URL, "https://mainnet.base.org"].filter(Boolean) as string[],
  usdc: () => addr("USDC_ADDRESS"),
  quoter: () => addr("AERODROME_QUOTER"),
  demoVault: () => addr("DEMO_VAULT_ADDRESS"),
  relayerKey: () => required("RELAYER_PRIVATE_KEY") as `0x${string}`,
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  // Live AI cards only when explicitly switched on (and a key is set); otherwise the cards written during the build are used.
  anthropicConfigured: () => process.env.AI_CARDS_ENABLED === "true" && Boolean(process.env.ANTHROPIC_API_KEY),
  // Demo money (USDC, 6 decimals). Budget plan: about 50 judge sessions on $2.
  demo: {
    allowanceMicro: 10_000n, // $0.01 lands at "midnight"
    pitchMicro: 10_000n, // $0.01 pitch buy
    giftMicro: 20_000n, // $0.02 gift from Aunty Funmi
    allowancePeriodSec: 15n, // short period so "Skip to morning" can release the next allowance without a wait
    sessionCapMicro: BigInt(Math.round(Number(process.env.DEMO_SESSION_CAP_USDC ?? "0.04") * 1e6)),
    dailyCapMicro: BigInt(Math.round(Number(process.env.DEMO_DAILY_CAP_USDC ?? "0.30") * 1e6)),
    maxSessionsPerIpPerHour: 5,
  },
};

export const BASESCAN = "https://basescan.org";
export const txUrl = (hash: string) => `${BASESCAN}/tx/${hash}`;
