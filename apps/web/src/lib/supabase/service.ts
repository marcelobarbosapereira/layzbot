import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/** Server-only client. Never import this module into browser code. */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  return createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
