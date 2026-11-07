-- Allowance — invites for devices and graduation (7 Nov 2026).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run more than once.

-- An invite is either a kid joining from a new device, or a kid at 18 claiming their own wallet.
alter table invites add column if not exists purpose text not null default 'device' check (purpose in ('device', 'graduate'));
-- For graduation: the kid's own wallet, checked on the server from their Coinbase sign-in.
alter table invites add column if not exists graduate_wallet text;
