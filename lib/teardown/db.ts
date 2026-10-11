import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Anonymous Supabase client for the public teardown page. It can only call
 * submit_teardown and teardown_booked (see migration 0009); RLS blocks every
 * table. The service role key never leaves the laptop.
 */
export function publicDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
