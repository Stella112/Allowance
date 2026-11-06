-- Allowance — demo schema (P0). Paste into Supabase: SQL Editor -> New query -> Run.
-- Row Level Security is ON with no policies: browsers (anon key) can read/write nothing.
-- Only the server, using the service-role key, touches these tables.

create table if not exists demo_sessions (
  id uuid primary key default gen_random_uuid(),
  kid_id text not null,                 -- bytes32 hex, anonymous on-chain id for this session's Tobi
  virtual_now timestamptz not null,     -- the session's simulated clock (Lagos night -> morning)
  morning boolean not null default false,
  ip_hash text not null,
  multipliers jsonb,                    -- each stock's uiMultiplier at bedtime (dividend detection)
  created_at timestamptz not null default now()
);

create table if not exists demo_events (
  id bigserial primary key,
  session_id uuid not null references demo_sessions(id) on delete cascade,
  kind text not null check (kind in ('allowance', 'pitch', 'gift', 'thank_you', 'group_gift', 'contribution', 'graduation')),
  status text not null check (status in ('pending', 'queued', 'sending', 'confirmed', 'failed', 'rejected', 'refunded')),
  ticker text,
  usdc_micro bigint not null default 0,  -- USDC amount in 6-decimal units
  tokens_raw text,                       -- stock units credited (raw B20, 8 decimals)
  why text,
  coach_q text,
  coach_a text,
  gifter_name text,
  occasion text,
  message text,
  tx_hash text,
  error text,
  ref_event_id bigint references demo_events(id) on delete cascade, -- thank_you -> the gift it thanks
  match_micro bigint not null default 0, -- parent match on a pitch, from the family pool
  match_pct int not null default 0,
  voice_path text,                       -- voice thank-you in the private voice-notes bucket
  chain_ref text,                        -- on-chain id, e.g. a group gift id
  created_at timestamptz not null default now(),
  executed_at timestamptz
);

create index if not exists demo_events_session_idx on demo_events (session_id, id);
create index if not exists demo_events_confirmed_idx on demo_events (status, executed_at desc) where tx_hash is not null;
create index if not exists demo_sessions_ip_idx on demo_sessions (ip_hash, created_at desc);

create table if not exists ai_cache (
  ticker text not null,
  age_band text not null,
  kind text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  primary key (ticker, age_band, kind)
);

alter table demo_sessions enable row level security;
alter table demo_events enable row level security;
alter table ai_cache enable row level security;
