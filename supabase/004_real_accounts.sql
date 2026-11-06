-- Allowance — real family accounts (6 Nov 2026).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run more than once.
-- Row Level Security is ON with no policies: only the server (service-role key) can read or write.

-- Parents sign in with a Coinbase embedded wallet (email one-time code).
create table if not exists parents (
  id uuid primary key default gen_random_uuid(),
  cdp_user_id text not null unique,       -- Coinbase end-user id, checked on the server
  email text,
  wallet text not null,                   -- the parent's smart account address
  vault text,                             -- the family vault, once created
  timezone text not null default 'Africa/Lagos',
  created_at timestamptz not null default now()
);

-- Our own sessions. The cookie holds a random token; only its SHA-256 hash is stored.
create table if not exists app_sessions (
  token_hash text primary key,
  role text not null check (role in ('parent', 'kid')),
  parent_id uuid not null references parents(id) on delete cascade,
  kid_id uuid,
  device_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists app_sessions_parent_idx on app_sessions (parent_id);

-- Passkeys (Face ID / fingerprint), one or more per parent.
create table if not exists passkeys (
  id text primary key,                    -- credential id (base64url)
  parent_id uuid not null references parents(id) on delete cascade,
  public_key text not null,               -- base64url
  counter bigint not null default 0,
  transports text[],
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- One-time WebAuthn challenges (registration or an approval of something specific).
create table if not exists webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references parents(id) on delete cascade,
  challenge text not null,
  purpose text not null,                  -- 'register' | 'approve-pitch' | 'graduate' | 'settings'
  ref text,                               -- what is being approved, e.g. a pitch id
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Kids: a profile the parent controls. Minimal data only. No email, phone, photo, school, surname.
create table if not exists kids (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references parents(id) on delete cascade,
  nickname text not null,
  birth_year int not null check (birth_year between 2006 and 2022),
  avatar text not null default '🙂',
  pin_hash text not null,                 -- scrypt
  chain_kid_id text not null unique,      -- random bytes32, the only on-chain identifier
  consent_at timestamptz not null,        -- when the parent ticked the consent box
  paused boolean not null default false,
  max_per_pitch_micro bigint not null default 5000000,   -- $5
  max_per_month_micro bigint not null default 20000000,  -- $20
  match_pct int not null default 0 check (match_pct between 0 and 100),
  allowance_micro bigint not null default 0,
  allowance_period text not null default 'weekly' check (allowance_period in ('weekly', 'monthly')),
  graduated_to text,
  created_at timestamptz not null default now()
);
create index if not exists kids_parent_idx on kids (parent_id);

-- Wrong-PIN tracking: at most 5 tries per 15 minutes per kid.
create table if not exists pin_attempts (
  id bigserial primary key,
  kid_id uuid not null references kids(id) on delete cascade,
  ok boolean not null,
  at timestamptz not null default now()
);
create index if not exists pin_attempts_kid_idx on pin_attempts (kid_id, at desc);

-- Devices a kid uses. The parent approves each new one and can remove it.
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references parents(id) on delete cascade,
  kid_id uuid not null references kids(id) on delete cascade,
  label text not null,
  status text not null check (status in ('pending', 'approved', 'removed')),
  token_hash text unique,                 -- device cookie token hash
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  last_seen_at timestamptz
);

-- Invite links, QR codes and 6-character family codes: one use, 24 hours.
create table if not exists invites (
  code text primary key,
  parent_id uuid not null references parents(id) on delete cascade,
  kid_id uuid not null references kids(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Pitches from real kids.
create table if not exists pitches (
  id bigserial primary key,
  kid_id uuid not null references kids(id) on delete cascade,
  ticker text not null,
  why text not null,
  coach_q text,
  coach_a text,
  usdc_micro bigint not null,
  match_pct int not null default 0,
  match_micro bigint not null default 0,
  status text not null check (status in ('pending', 'sending', 'confirmed', 'declined', 'failed')),
  tokens_raw text,
  tx_hash text,
  error text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists pitches_kid_idx on pitches (kid_id, created_at desc);

-- Gift links a parent shares with relatives (single or group gift).
create table if not exists gift_links (
  code text primary key,
  parent_id uuid not null references parents(id) on delete cascade,
  kid_id uuid not null references kids(id) on delete cascade,
  kind text not null check (kind in ('single', 'group')),
  ticker text,
  target_micro bigint,
  group_chain_id text,                    -- on-chain group gift id, once opened
  created_at timestamptz not null default now()
);

-- Gifts and contributions that arrived (recorded from the on-chain transaction).
create table if not exists gifts (
  id bigserial primary key,
  kid_id uuid not null references kids(id) on delete cascade,
  link_code text references gift_links(code) on delete set null,
  kind text not null check (kind in ('gift', 'contribution', 'group_settled')),
  gifter_name text,
  occasion text,
  message text,
  ticker text,
  usdc_micro bigint not null default 0,
  tokens_raw text,
  from_address text,
  tx_hash text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists gifts_kid_idx on gifts (kid_id, created_at desc);

-- Thank-yous from kids back to gifters.
create table if not exists thank_yous (
  id bigserial primary key,
  gift_id bigint not null references gifts(id) on delete cascade,
  kid_id uuid not null references kids(id) on delete cascade,
  message text,
  voice_path text,
  created_at timestamptz not null default now()
);

-- Allowance releases done by the night shift.
create table if not exists allowance_runs (
  id bigserial primary key,
  kid_id uuid not null references kids(id) on delete cascade,
  usdc_micro bigint not null,
  tx_hash text,
  status text not null check (status in ('sending', 'confirmed', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

alter table parents enable row level security;
alter table app_sessions enable row level security;
alter table passkeys enable row level security;
alter table webauthn_challenges enable row level security;
alter table kids enable row level security;
alter table pin_attempts enable row level security;
alter table devices enable row level security;
alter table invites enable row level security;
alter table pitches enable row level security;
alter table gift_links enable row level security;
alter table gifts enable row level security;
alter table thank_yous enable row level security;
alter table allowance_runs enable row level security;
