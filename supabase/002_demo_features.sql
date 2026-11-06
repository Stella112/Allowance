-- Allowance — demo features (6 Nov 2026). Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once.

-- Parent match on a pitch (paid from the family pool), and the percentage Mum chose.
alter table demo_events add column if not exists match_micro bigint not null default 0;
alter table demo_events add column if not exists match_pct int not null default 0;

-- Voice thank-yous: path of the recording in the private "voice-notes" storage bucket.
alter table demo_events add column if not exists voice_path text;

-- Each stock's dividend multiplier (uiMultiplier) at bedtime, to detect a real overnight dividend.
alter table demo_sessions add column if not exists multipliers jsonb;
