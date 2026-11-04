# Verified facts

One line per fact: **status**, the fact, its source, and the date checked. Addresses need two sources: the official issuer or vendor page, plus an on-chain or Basescan check. Rerun the on-chain checks with `pnpm verify:chain`, which is read-only.

## Network

- VERIFIED: Base mainnet chain ID is 8453. Sources: https://github.com/base/skills (skills/build-on-base/references/network.md) and `eth_chainId` → `0x2105` on https://mainnet.base.org. Checked 2026-11-04.
- VERIFIED: the public RPC `https://mainnet.base.org` is rate-limited and not for production; use a dedicated provider for `BASE_RPC_URL`. Source: base/skills network.md. Checked 2026-11-04.
- VERIFIED: the explorer is https://basescan.org. Source: base/skills network.md. Checked 2026-11-04.

## Tokenized stocks (blocker 1)

- VERIFIED: Coinbase issues the stocks on Base as B20 tokens (an ERC-20 extension). They are **native precompiles**, so Basescan has no per-token verified source code; instead, the docs and the official API are the issuer sources. Source: https://docs.base.org/base-chain/asset-issuance/tokenized-stocks-on-base. Checked 2026-11-04.
- VERIFIED: AAPLc is `0xb200000000000000000000C2e324d24d7eEcd1fb`, with 8 decimals and a uiMultiplier of 1.0. Sources: the official API https://api.coinbase.com/v1/tokenized-stocks, linked from the Base docs above, and on-chain `decimals()` / `uiMultiplier()`. Checked 2026-11-04.
- VERIFIED: NVDAc is `0xb20000000000000000000078ee7ce2fE4908108C`, with 8 decimals and a uiMultiplier of about 1.000538, meaning a real dividend has already been applied. Same sources. Checked 2026-11-04.
- VERIFIED but not yet used: MSFTc is `0xB200000000000000000000Ab99cFa739E253872B`, AMZNc is `0xb200000000000000000000d9192b6B456483C2E8`, and GOOGLc is `0xb2000000000000000000002D0BA3164cc74f58B7`. All are in the official API with non-zero supply. No pools have been checked for them yet.
- DROPPED: KOc (`0xb200000000000000000000ffef181DB6dC5ed6A3`) has no supply in the official API. Checked 2026-11-04.
- NOTE: the tokens' Chainlink price feeds (AAPL `0x787f13dEa48Db0897CbCDD985de77809D837F988`, NVDA `0x04689a41629776563E6822F76f2e57D148d28513`) are **not** token addresses. Source: Base docs above.

## Transfer rules (blocker 2)

- VERIFIED: secondary-market holding and trading is permissionless. KYC applies only to mint and redeem by Authorized Participants, and on-chain policies can block specific addresses, such as sanctioned ones. Source: Base tokenized-stocks docs, "Compliance" section. Checked 2026-11-04.
- VERIFIED: the policy registry precompile is at `0x8453000000000000000000000000000000000002`, and `isAuthorized(uint64,address)` never reverts. Source: https://docs.base.org/specifications/b20/reference/constants. Checked 2026-11-04.
- VERIFIED: for both AAPLc and NVDAc, the TRANSFER_SENDER, TRANSFER_RECEIVER and TRANSFER_EXECUTOR scopes are bound to policy 5, and policy 5 authorizes a freshly generated address. This means a new FamilyVault, relayer or relative wallet can hold, send and receive the tokens unless it is listed. Source: on-chain `policyId(bytes32)` plus `isAuthorized`, via `pnpm verify:chain`. Checked 2026-11-04.
- TODO (Phase 1): repeat the policy check for the deployed vault's address, on a fork.

## Balances and dividends (blocker 3)

- VERIFIED: `balanceOfUI(account)` returns the raw balance × the multiplier, and `uiMultiplier()` returns the current multiplier, scaled by 1e18 (WAD). Cash dividends are converted into a **multiplier increase**; the raw balance does not change. Multiplier changes emit `UIMultiplierUpdated`, which should be dated by `effectiveAtTimestamp`. Source: Base tokenized-stocks docs, "Multipliers" section. Checked 2026-11-04.
- DESIGN CONSEQUENCE: the vault tracks per-kid **raw** units. A kid's shares = raw × multiplier. A dividend line in the Morning Report means the multiplier went up since the kid's last report.

## Swaps (blocker 4)

- VERIFIED: Aerodrome Slipstream ("Gauges V3 Deployment"): the PoolFactory is `0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef`, the SwapRouter is `0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F`, and the Quoter is `0x514c8B5f54112481E28028F1166Bd78501089259`. Sources: https://github.com/aerodrome-finance/slipstream (README, Deployments), plus on-chain `router.factory()` and `quoter.factory()` both returning the factory. Checked 2026-11-04.
- VERIFIED: the AAPLc/USDC pool is `0xA3b1E3f9747065e2073722Ff4c9027d3eA4994F0`, with tick spacing 10 and about $65k of liquidity. Source: on-chain `factory.getPool(USDC, AAPLc, 10)`, with the liquidity figure from DexScreener. Checked 2026-11-04.
- VERIFIED: the NVDAc/USDC pool is `0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9`, with tick spacing 10 and about $513k of liquidity. Same sources. Checked 2026-11-04.
- VERIFIED: price impact. Quotes for $0.25, $1 and $5 have the same effective price to within 0.01%. AAPLc fills at about $352.77, which is 0.44% under the NAV of $354.32; NVDAc fills at about $203.95, equal to the NAV. The quoter's gas estimate is 150k–216k. Source: on-chain `quoteExactInputSingle`. Checked 2026-11-04.
- UNVERIFIED (not used): the larger "aero" pools (AAPLc `0xF5FC…6BA6`, NVDAc `0xF668…C8EC`) come from factory `0x9cb220581b91b0c83223012fe69688b92ad07a76`, which is not listed in any aerodrome-finance repo.
- ROUTER INTERFACE: `exactInputSingle((tokenIn, tokenOut, int24 tickSpacing, recipient, deadline, amountIn, amountOutMinimum, sqrtPriceLimitX96))`. Source: slipstream `contracts/periphery/interfaces/ISwapRouter.sol`.

## Eligibility (blocker 5)

- VERIFIED: "Coinbase tokenized stocks are only available to persons in eligible jurisdictions outside of the U.S." On-chain policies don't screen by region; the restriction is legal, not technical. The demo vault holds the tokens, not the judges. Source: Base tokenized-stocks docs, "Disclaimer" section. Checked 2026-11-04.
- ACTION: show the issuer, a link to https://www.base.org/stocks, and the eligibility notice on every stock card and gift page.

## USDC

- VERIFIED: native USDC on Base is `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, with 6 decimals. Sources: https://developers.circle.com/stablecoins/usdc-contract-addresses (links basescan.org/token/0x8335…2913) and on-chain `symbol()` = "USDC". It is also token0 of both pools above. Checked 2026-11-04.

## Tooling

- VERIFIED: Foundry **v1.8.4 or later** is required for the B20 precompiles. Tests and forks must set `hardfork = "base:Cobalt"`, or a fork runs Beryl rules. Source: https://docs.base.org/sdks/base-anvil. Checked 2026-11-04.
- VERIFIED: deploy with a Foundry keystore (`cast wallet import`), never a raw key, and verify on Basescan with `ETHERSCAN_API_KEY`. Source: base/skills deploy-contracts.md. Checked 2026-11-04.
- NOTE: base/skills says to add Builder Code (ERC-8021) attribution to every transaction. This is optional and not in our scope; it's logged in IDEAS.md.

## Packages (exact pins; each was published at least 14 days before 2026-11-04, per npm `time`)

- next 16.4.2, react / react-dom 19.3.0, typescript 5.9.3, tailwindcss and @tailwindcss/turbopack 4.3.3, eslint 9.39.5, eslint-config-next 16.4.2, @types/node 20.19.43, @types/react and @types/react-dom 19.3.0, viem 2.57.7, vitest 4.1.12.
- Found on npm but not installed yet; they get added in the phase that needs them: wagmi 3.7.9, @tanstack/react-query 5.104.5, @simplewebauthn/server 14.0.3, @simplewebauthn/browser 14.0.0, @anthropic-ai/sdk 1.0.0, @supabase/supabase-js 2.118.0, @supabase/ssr 0.12.7, @playwright/test 1.64.1, html-to-image 1.11.13, @base-org/account 2.5.13.
- UNVERIFIED (needed for P1-1): CDP Embedded Wallets. The `@coinbase/cdp-react`, `cdp-hooks`, `cdp-wagmi` and `cdp-core` packages are at 0.0.128, which is pre-1.0. I haven't yet found the docs pages for email one-time-code sign-in, smart accounts or paymaster pricing. To verify before Phase 5.
- UNVERIFIED (needed for P1-5): Base spend permissions on mainnet. The Base docs list a "Charge on a Schedule" page at /build-on-base/accept-payments/charge-on-a-schedule. To verify before Phase 5.
- UNVERIFIED: the current Anthropic model ID. To check against Anthropic's docs before Phase 3.
