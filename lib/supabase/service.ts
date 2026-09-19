import { createClient } from "@supabase/supabase-js";

/** Bypasses Row Level Security using the service_role key. NEVER import
 * this into anything that runs in the browser — server-only (route
 * handlers, server components, server actions). Every call site is
 * responsible for its own authorization check (see lib/auth.ts) since RLS
 * is not the safety net here. */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service role is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
