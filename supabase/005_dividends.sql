-- Allowance — real dividends for real families (7 Nov 2026).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run more than once.

-- The last uiMultiplier the night shift saw for each stock token.
create table if not exists token_multipliers (
  token text primary key,
  multiplier text not null,          -- WAD, as a decimal string
  updated_at timestamptz not null default now()
);

-- A rise in a token's uiMultiplier = a real dividend was paid. Never simulated.
create table if not exists dividend_events (
  id bigserial primary key,
  token text not null,
  old_multiplier text not null,
  new_multiplier text not null,
  seen_at timestamptz not null default now()
);

alter table token_multipliers enable row level security;
alter table dividend_events enable row level security;
