import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { env } from "@/lib/env";

// The app sends its session as "Authorization: Bearer <access token>" instead of cookies.
// The token is remembered per client so currentUser() can verify it (signature and expiry).
const BEARER = new WeakMap<SupabaseClient, string>();
export const bearerOf = (db: SupabaseClient) => BEARER.get(db);

// Supabase client for server components and route handlers, signed in as the visitor
// (website: session cookies; app: bearer token). Row level security applies either way.
export async function supabaseServer(): Promise<SupabaseClient> {
  const auth = (await headers()).get("authorization") || "";
  const token = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/.exec(auth.trim())?.[1];
  if (token) {
    const db = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    BEARER.set(db, token);
    return db;
  }
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a server component: the middleware refreshes the session instead.
        }
      },
    },
  }) as unknown as SupabaseClient;
}
