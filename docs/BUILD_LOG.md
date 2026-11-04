# Build log

One line per task, describing how AI was used. This feeds the "AI tools used" submission field.

- 2026-11-04: Claude Code (Opus 5.5) restated the build prompt and found gaps in it (the vault cap would be hit during judging, B20 tokens are precompiles, and fork support was in doubt).
- 2026-11-04: Phase 0 verification. Claude Code read the Base docs, the base/skills repo, the official Coinbase tokenized-stocks API, the Aerodrome Slipstream GitHub and Circle's docs. It then ran read-only mainnet checks (pools, quotes, transfer policies) and recorded each fact in docs/VERIFIED.md.
- 2026-11-04: Claude Code installed Foundry (pinned to v1.8.6 because the newest release was too recent) and wrote a mainnet-fork smoke test. The test proved that real Aerodrome swaps credit a brand-new contract with Apple and Nvidia stock tokens.
- 2026-11-04: Claude Code scaffolded Next.js 16 with exact pinned versions, plus the docs, the env template and `scripts/verify-chain.mjs`.
