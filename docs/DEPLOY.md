# Putting Allowance online (Vercel)

About 20 minutes. You need: your GitHub account (Stella112), the repo pushed, and your `.env.local` open so you can copy values. Never paste keys into a chat.

## 1. Push the code to GitHub

In a terminal in `C:\vibeathon`:

```bash
git push origin main
```

(The repo is https://github.com/Stella112/Allowance. `.env.local` is never uploaded; it's in `.gitignore`.)

## 2. Create the Vercel project

1. Go to **vercel.com** and sign up with **GitHub**.
2. **Add New… → Project**, pick **Stella112/Allowance**, click **Import**.
3. Framework preset: **Next.js** (detected). Leave the build settings as they are.
4. Open **Environment Variables** and add every line below (Name on the left, value from your `.env.local`):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | `8453` |
| `USDC_ADDRESS`, `AERODROME_CL_FACTORY`, `AERODROME_SWAP_ROUTER`, `AERODROME_QUOTER`, `AAPLC_ADDRESS`, `NVDAC_ADDRESS` | same as `.env.local` |
| `FAMILY_VAULT_FACTORY_ADDRESS` | `0x0504E2983f0655D01B01ff94725cdae2D8c2FDcD` |
| `DEMO_VAULT_ADDRESS` | `0xaB7A0f6ea2fb8b81096dbBe3c055101b258689F2` |
| `RELAYER_PRIVATE_KEY` | same as `.env.local` (secret) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | same as `.env.local` |
| `NEXT_PUBLIC_CDP_PROJECT_ID`, `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET` | same as `.env.local` |
| `NEXT_PUBLIC_CDP_PAYMASTER_URL` | same as `.env.local` (optional) |
| `CRON_SECRET` | a new random string of 20+ letters and numbers (make one with any password generator) |
| `WEBAUTHN_RP_ID` | leave for now (step 4) |
| `WEBAUTHN_ORIGIN` | leave for now (step 4) |
| `DEMO_SESSION_CAP_USDC`, `DEMO_DAILY_CAP_USDC` | same as `.env.local` |

5. Click **Deploy**. When it finishes you get an address like `https://allowance-abc.vercel.app`.

## 3. Tell Coinbase about the live address

Coinbase portal → **Wallets → Non-custodial Wallet → Clients** → **Add domain** → your Vercel address, e.g. `https://allowance-abc.vercel.app` (https, no slash at the end).

## 4. Set the Face ID (passkey) address and redeploy

In Vercel → your project → **Settings → Environment Variables**:

- `WEBAUTHN_RP_ID` = the host only, e.g. `allowance-abc.vercel.app`
- `WEBAUTHN_ORIGIN` = the full address, e.g. `https://allowance-abc.vercel.app`

Then **Deployments → ⋯ → Redeploy**. (Passkeys made on localhost don't work on the live site; parents set Face ID up again there, which takes one tap.)

## 5. Check it

- `https://<your-address>/demo`: the Adeyemi demo should start.
- `https://<your-address>/parent`: sign in with your email.
- The night shift runs by itself once a night at 23:00 UTC (midnight in Lagos); see Vercel → **Settings → Cron Jobs**.
