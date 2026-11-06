-- Allowance — group gifts and graduation in the demo (6 Nov 2026).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run more than once.

-- New event kinds: a group gift, each relative's contribution to it, and graduation.
alter table demo_events drop constraint if exists demo_events_kind_check;
alter table demo_events add constraint demo_events_kind_check
  check (kind in ('allowance', 'pitch', 'gift', 'thank_you', 'group_gift', 'contribution', 'graduation'));

-- New status: a contribution that was refunded when a group gift was called off.
alter table demo_events drop constraint if exists demo_events_status_check;
alter table demo_events add constraint demo_events_status_check
  check (status in ('pending', 'queued', 'sending', 'confirmed', 'failed', 'rejected', 'refunded'));

-- The on-chain id of a group gift.
alter table demo_events add column if not exists chain_ref text;
