import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

let _db: SupabaseClient | null = null;

/** Server-only Supabase client using the service-role key. RLS blocks everyone else. */
export function db() {
  return (_db ??= createClient(config.supabaseUrl(), config.supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

export type DemoSession = {
  id: string;
  kid_id: `0x${string}`;
  virtual_now: string;
  morning: boolean;
  ip_hash: string;
  multipliers: Record<string, string> | null;
  created_at: string;
};

export type DemoEvent = {
  id: number;
  session_id: string;
  kind: "allowance" | "pitch" | "gift" | "thank_you";
  status: "pending" | "queued" | "sending" | "confirmed" | "failed" | "rejected";
  ticker: string | null;
  usdc_micro: number;
  tokens_raw: string | null;
  why: string | null;
  coach_q: string | null;
  coach_a: string | null;
  gifter_name: string | null;
  occasion: string | null;
  message: string | null;
  tx_hash: string | null;
  error: string | null;
  ref_event_id: number | null;
  match_micro: number;
  match_pct: number;
  voice_path: string | null;
  created_at: string;
  executed_at: string | null;
};
