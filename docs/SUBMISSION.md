# Vibeathon 02 submission: Allowance

Submit at app.vibestarter.xyz/vibeathon/submit, signed in with the wallet you applied with. Deadline: Mon 9 Nov 2026, 22:00 UTC. You can edit until then.

## Project name

Allowance

## Tagline (one line)

The family money app that works the night shift: kids pitch real stocks, parents approve with Face ID, and relatives abroad gift shares overnight.

## Live URL

`https://<your-vercel-address>` (fill in after deploying, see docs/DEPLOY.md)

## What it does and what to try

Allowance runs on Base mainnet with real USDC and real Coinbase tokenized stocks (Apple, Nvidia). While kids sleep, their allowance lands, relatives in other time zones gift shares, and every morning they wake up to a Morning Report.

**Try it in 2 minutes, no wallet needed:** open `/demo` (the Adeyemi family). Every step is a real Base transaction, paid in cents by Allowance, with a Basescan link.
1. As Tobi (PIN 1234), pick Apple or Nvidia, read the card written for his age, answer the pitch coach's question and send a bedtime pitch.
2. As Aunty Funmi in London, send a gift, or start a group gift with Uncle Dayo in Houston (real on-chain escrow, with refunds).
3. Tap Skip to morning: the night shift delivers the gift and the midnight allowance on Base.
4. As Mum, approve at breakfast with a 50% match. Real shares are bought.
5. Read Tobi's Morning Report (gifts, match, scorecard, real-dividend check, leaderboard), send a voice thank-you, save it as an image.
6. Bonus: fast-forward to 18 and graduate Tobi; every share moves out of the vault in one transaction.

**Real families** (`/parent`): email sign-in with a Coinbase embedded wallet, passkey (Face ID) approvals checked on the server, kid PIN profiles with consent, a family vault per family created by the parent's own wallet, allowances, limits and matching, gift links that relatives pay from their own wallet, kids' own devices via QR or family code with parent approval, a nightly cron, and graduation to the kid's own wallet.

**Safety:** caps enforced in the vault contract ($5/tx, $20/kid/month, $100 total), owner-only pause and emergency withdraw, no proxies, kids can only request, minimal child data, and AI content that never gives advice ("Learning only, not financial advice").

## AI tools it was built with

Claude Code (Claude Opus) built the whole project end to end: it verified addresses against Base docs and on-chain reads, wrote and fork-tested the Solidity contracts (51 tests against the real tokens and Aerodrome), deployed them with the owner's approval of each spend, and wrote the Next.js app, Supabase schema and integrations. Explainer cards (3 age bands) and pitch-coach questions were written with Claude; the app can call Claude (Anthropic API) live when a key is set. docs/BUILD_LOG.md has the full log.

## Optional fields

- Repo: https://github.com/Stella112/Allowance
- Contracts (Sourcify exact match): factory `0x0504E2983f0655D01B01ff94725cdae2D8c2FDcD`, demo vault `0xaB7A0f6ea2fb8b81096dbBe3c055101b258689F2`
- Demo video / screenshot / X handle / Fundable score link: add if you have them.

## Honest notes (for you, before you submit)

- The demo and the contracts have run live on mainnet; transactions are in docs/BUILD_LOG.md.
- Real-family flows were built on 6–7 Nov; on 7 Nov the parent sign-in, passkey setup, add child and vault creation ran live. Gift links, the night shift, kid devices and graduation for real families were built but not yet run live; test them before you submit, or describe them as built-but-untested.
- Coinbase gas sponsorship (paymaster) refused our transactions on mainnet; the first parent wallet was topped up with 0.00006 ETH. Real parents currently need a few cents of ETH on Base.
- Live AI is off unless an Anthropic key is set; the cards say "Written with Claude while building Allowance".
- Contracts are verified on Sourcify; Basescan verification needs a Basescan API key.
