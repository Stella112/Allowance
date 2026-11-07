# Allowance

The family money app that works the night shift. Kids pitch real stocks, parents approve with Face ID, and relatives abroad gift shares overnight, so kids wake up owning a piece of Apple. Built for Vibeathon 02 ("Night shift") on Base mainnet with real USDC and Coinbase tokenized stocks.

- **Demo:** `/demo`, the Adeyemi family. Real Base transactions in cents, no wallet needed.
- **Parents:** `/parent` (Coinbase embedded wallet, passkeys). **Kids:** `/kid`, `/join`. **Relatives:** `/gift/<code>`. **Graduation:** `/graduate/<code>`.
- **Product spec:** [docs/PRODUCT.md](docs/PRODUCT.md) · **Verified facts and sources:** [docs/VERIFIED.md](docs/VERIFIED.md) · **Build log:** [docs/BUILD_LOG.md](docs/BUILD_LOG.md) · **Deploy:** [docs/DEPLOY.md](docs/DEPLOY.md)

## Contracts (Base mainnet, Sourcify exact match)

- FamilyVaultFactory v2: `0x0504E2983f0655D01B01ff94725cdae2D8c2FDcD`
- Demo FamilyVault v2: `0xaB7A0f6ea2fb8b81096dbBe3c055101b258689F2`

One vault per family, owned by the parent's wallet. It tracks USDC and stock shares per kid by anonymous id, and enforces caps ($5/tx, $20/kid/month, $100 total). It also supports parent matching, allowances, gifts, group-gift escrow with refunds, graduation with a transfer-rule check, pause and owner-only emergency withdraw. There are no proxies. Source and 51 mainnet-fork tests are in `contracts/`.

## Run locally

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `.env.local` and fill in the values. Run the SQL files in `supabase/` in order in the Supabase SQL editor. Contracts: `cd contracts && forge test` (needs Foundry 1.8.4+ for the Base B20 precompiles).

Learning only, not financial advice.
