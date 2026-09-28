import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Public, cookie-less client for data every visitor sees. Its results are cached
// and shared between visitors, so it must only ever read public data.
let client: SupabaseClient | null = null;
export function supabasePublic() {
  if (!client) client = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
