# Allowance — Full Product Description

4 Nov 2026 · @Stellamaris. This is the authority for scope. **Owner decision (6 Nov): build everything in this document; nothing is cut.**

## One line

The family money app that works the night shift. While kids sleep, their weekly or monthly allowance lands, relatives abroad gift real shares, and every morning they wake up owning a little more.

Short version: kids pitch real stocks, parents approve, and relatives abroad gift shares overnight, so kids wake up owning a piece of Apple.

Allowance runs on Base mainnet with real USDC and real tokenized stocks. Kids pitch companies, parents approve with Face ID, relatives in other time zones send shares instead of cash, and each kid wakes up to a Morning Report of what arrived overnight. Built for Vibeathon 02, theme "Night shift".

## The problem

Parents in the US have Greenlight and Acorns to teach kids investing with real stocks. Families in Nigeria and much of the world don't, even though they can now hold real US stocks on Base.

Families are also split across time zones. An aunty in London or an uncle in Houston sends money home while the kids in Lagos are asleep, and it arrives as cash that gets spent. Billions move this way every year, when they could be shares that grow instead of cash that gets spent.

## The night shift

Allowance does its work overnight, so mornings feel like Christmas.

- **Allowance at midnight.** The weekly or monthly USDC allowance lands in the kid's savings automatically at local midnight, with no one awake to send it.
- **Gifts from other time zones.** A relative's evening is the kid's night, so gifts arrive overnight. The gift page shows a time zone clock: "It's 2am in Lagos. Tobi will wake up to your gift."
- **Bedtime pitches.** Between 7pm and 6am local time, the pitch flow switches to a calm night theme and ends with "Mum will see this in the morning." The parent answers with breakfast.
- **The Morning Report.** Each kid wakes up to one screen showing what arrived, what was approved, any dividends, and how their companies did, each with a Basescan link. Kids can save it as an image card and send it to grandparents on WhatsApp.
- **Thank-yous across time zones.** The kid's thank-you is waiting for the gifter when they wake up.

## Who it's for

| User | Who they are | What they can do |
|---|---|---|
| Parent | Has an account and a wallet; owns the family vault | Set allowances, approve pitches, match investments, set limits, manage kids and devices |
| Kid | A PIN profile under a parent, ages 6 to 17; no wallet, no email | Save, pitch companies, see their shares, send thank-yous; can only make requests, never move money |
| Relative | Family anywhere in the world; needs no Allowance account to open a gift | Gift shares by link with real USDC from their own wallet, chip into group gifts, receive thank-yous |

## Getting started

### Parents

- Sign up with email and a 6-digit code. There's no password and no seed phrase. A secure wallet is created in the background, and gas is sponsored where the wallet provider supports it.
- Register Face ID or fingerprint (a passkey) after the first sign-in.
- Every approval needs biometrics, checked on the server, so a kid up late on the parent's phone can't approve their own pitch.
- On a new phone, sign in with email and the code again, then set up Face ID.
- First child creates the family vault. When the parent adds their first kid, the app deploys a family vault on Base, owned by the parent's wallet. The cost is shown before the parent signs.

### Adding a kid

- The parent taps Add child and enters a first name or nickname, a birth year, an avatar and a 4-digit PIN.
- The parent ticks a consent box, because child data has extra privacy rules. The consent time is recorded.
- Kids get no email, password or wallet. Their profile is a record the parent controls, and on-chain they're identified only by an anonymous ID, never a name.
- PINs are stored hashed, and wrong guesses are limited to 5 per 15 minutes.

### How kids log in

- Same device: tap "Switch to Tobi" and enter the PIN, Netflix-style.
- Together: the kid scans a QR code from the parent's phone.
- At school or apart: the parent sends an invite link on WhatsApp, SMS or email, or gives a 6-character family code. The kid enters it with their PIN.
- The parent approves every new device: "Tobi's tablet wants to join. Approve?"
- Links expire after 24 hours and work once, and the parent can remove any device.

## How it works for parents

- **Set an allowance once.** Choose a weekly or monthly USDC amount per kid. It lands in the kid's savings at local midnight, through Base spend permissions or a scheduled vault release.
- **Approve pitches in one tap with Face ID.** Bedtime pitches are waiting in the morning, and each approved pitch buys real shares into the family vault.
- **Match their investing.** Set a match from 0% to 100%, for example adding 50% on top of each investment. The match shows separately in the Morning Report: "Mum matched 50%."
- **Set limits per kid,** a maximum per pitch and per month. The app and the vault contract both reject anything over the limit.
- **Controls:** PIN resets, pausing a profile, and device management.

## How it works for kids

- Allowance lands every week or month while you sleep, and you can save toward goals.
- Pitch a company: pick Nvidia or Apple and explain why in up to 280 characters.
- AI explainer cards describe each company in simple words: what it does, how it makes money, and one thing to watch. Cards are written for your age, with different versions for ages 6 to 9, 10 to 13 and 14 to 17.
- AI pitch coach: before a pitch goes to your parent, the AI asks one simple question, like "What does Apple sell?" or "What could go wrong?" Your answer goes with the pitch.
- Own real shares. After approval, you see "You own a piece of Nvidia," with a Basescan link to the real transaction.
- Dividend day: when a company you own pays a real dividend, the Morning Report shows it: "Apple paid you overnight!"
- Pitch scorecard: months later, see how your picks did: "Your Nvidia pitch: up 18% since you picked it."
- Family leaderboard: siblings and cousins rank by pitches made, approvals won and thank-yous sent, never by returns, so it rewards learning, not gambling.
- Morning Report card: save it as an image and share it with family.
- Kids can only make requests. They can never move money, approve anything or change settings.

AI cards and the coach never give buy or sell advice, and every card carries a small "Learning only, not financial advice" note.

## How it works for relatives

- **Gift a share by link, from any time zone.** An aunty in London opens the link after work, picks a company and an amount, sees the time zone clock, and pays in USDC from her own wallet. Her niece in Lagos wakes up owning a slice of Apple.
- **Clear before signing.** The gift page shows the amount, the network (Base), what the kid gets and the family vault receiving it, before the relative signs.
- **Gift occasions:** Birthday, Graduation, Eid, Christmas and Good grades templates, each with a themed message and card design.
- **Group gifts:** several relatives chip in on one link toward a target, with a progress bar. Contributions are held in the vault and turned into shares when the target is reached or the organizer closes it. Contributions can be refunded before then.
- **A thank-you comes back:** the kid records a voice note of up to 30 seconds, or writes a text thank-you, that's waiting for the gifter when they wake up.

## Money model

Every dollar sits in the family vault on Base, tracked per kid, and only the parent or the app's approved operator can move it.

1. **Allowance becomes savings.** Each weekly or monthly allowance is credited to the kid's USDC balance in the vault. It doesn't buy anything automatically.
2. **Pitches spend savings.** When a parent approves a pitch, the vault swaps that kid's USDC for the stock token through Aerodrome, with slippage limits, and credits the shares to the kid.
3. **The match comes from the parent.** A parent match is added from the parent's own funds on top of the kid's amount.
4. **Gifts go straight to the kid.** A relative's USDC goes into the vault and is swapped into the chosen stock for that kid.
5. **Dividends are real only.** The Morning Report shows a dividend only when the token reports one. Nothing is ever simulated on real tokens.

| Safeguard | Starting value |
|---|---|
| Max per transaction | $5 USDC |
| Max per kid per month | $20 USDC |
| Max total per family vault | $100 USDC |
| Pause and emergency withdraw | Owner only |

Caps are enforced in the vault contract itself, not just in the app, and only the parent can raise them.

## At 18: Graduation

- The parent taps Graduate Tobi, and Tobi signs up with their own email and gets their own wallet.
- Shares move on-chain from the family vault to Tobi's wallet after an eligibility check against the token's transfer rules.
- Their full history comes with them: every pitch, gift and thank-you since childhood.
- The parent stays connected as a family member who can still gift.

## Try the demo

Anyone can live a full night shift in under 2 minutes, with no wallet, no funds and no sign-up, using real Base mainnet transactions paid for by Allowance.

1. Open the app and tap Try the Adeyemi family demo.
2. Switch to Tobi (PIN 1234), pick Apple or Nvidia, read the AI card, answer the coach's question and send the pitch.
3. Switch to Mum and approve it. A real buy goes through, with a Basescan link.
4. Switch to Aunty Funmi in London, pick an occasion and gift a share. The clock shows it's the middle of the night in Lagos.
5. Tap Skip to morning. The night passes in a few seconds, and the queued gift and allowance go through as real transactions.
6. See Tobi's Morning Report: "Aunty Funmi sent you a slice of Apple while you slept." Send a thank-you back.

How the demo stays safe and honest:

- Each demo session gets its own fresh Tobi on-chain, so judges never see each other's activity.
- Demo amounts are tiny, around $0.25 per transaction, and capped per session and per day in a separate demo vault. (Build note: the $3 budget sets demo amounts to cents; see docs/BUILD_LOG.md.)
- If the daily demo cap is reached, the demo shows a replay of recent real demo transactions, labeled "Replay of a real transaction". It never fakes one.
- Where Face ID isn't available, such as in a headless browser, approval uses a clearly labeled "Demo approval" step. The transaction is still real.

## Safety, privacy and honesty

- Minimal child data: only a nickname, birth year, avatar and hashed PIN. No child email, phone, photo, school, location or surname. On-chain, kids are anonymous IDs.
- Parent consent is required before any child profile is created.
- Kids can only request. No kid session can move funds, approve anything or change settings, enforced in the server and the contracts.
- Biometric approvals, verified on the server before any purchase.
- Capped, pausable contracts with an owner-only emergency withdraw, no upgradeable proxies and no arbitrary external calls.
- No secrets in the app or repo. Allowance never asks for private keys, seed phrases or passwords.
- No financial advice. AI content is educational, and every card says so.
- Clear money screens. Every transaction shows the amount, network, what you get and the recipient before signing, plus its status and a Basescan link after.

## Built on Base

| Part | What it uses |
|---|---|
| Stocks | Real Coinbase tokenized stocks, backed 1:1 by real shares |
| Money | Native USDC on Base |
| Buying | Swaps through Aerodrome, with slippage limits and deadlines |
| Parent login | Coinbase embedded wallets with email one-time codes and sponsored gas |
| Approvals | Passkeys (Face ID or fingerprint), verified on the server |
| Allowance | Base spend permissions, or a scheduled vault release |
| Transfer checks | The stock's transfer rules (isAuthorized) are checked before every buy or gift, so transactions don't fail |
| Balances | balanceOfUI, so dividend increases show up correctly |
| Contracts | FamilyVault (one per family, per-kid balances, caps, pause) and FamilyVaultFactory |
| App | Next.js, TypeScript and Tailwind on Vercel; Supabase for profiles, pitches, gifts and voice notes |
| AI | Claude (Anthropic API) for explainer cards and the pitch coach, server-side only |

Every contract was tested against the real tokens and Aerodrome on a Base mainnet fork before deploying, and is verified on Basescan.

## What makes it different

- Unlike Greenlight and Acorns, it works outside the US.
- Unlike Ferfie, a Base allowance app, kids own real companies.
- Kids pitch and parents approve, with an AI coach in between, so every investment is a lesson.
- Built for families across time zones: overnight gifting, the gift clock and the Morning Report turn the distance into something kids look forward to.
- Overnight diaspora gifting, group gifts, the Morning Report, parent matching and Graduation don't exist in any family app I found.

## Why people come back

Every morning there's something new: allowance that landed, a gift from another time zone, an answered pitch, a thank-you, a dividend, or a scorecard showing how a past pick did.

## Path to launch

- Today: a working MVP on Base mainnet with capped, real transactions and a public demo.
- Next: pilot families in Lagos with relatives in the UK and US, and gift occasions timed to birthdays, Eid and Christmas.
- Before scaling: custody, licensing and KYC partners for holding securities on behalf of minors, and higher caps once contracts are audited.

## The vision

A child who grows up owning companies while they sleep, then takes them into adulthood.
