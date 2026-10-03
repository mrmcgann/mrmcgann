import "react-native-url-polyfill/auto";
import { AppState, Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";
import { secureStorage } from "./storage";

// The member's own data (watchlist, invoices, alerts, their listings) is read straight
// from Supabase with their session, exactly like the website's signed-in pages:
// row level security means they only ever see their own rows. Public data (listings,
// search) comes from the website's cached API instead, so the app adds no database load.
export const supabase = createClient(SUPABASE_URL || "https://placeholder.supabase.co", SUPABASE_ANON_KEY || "public-anon-key", {
  auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 5 } },
});

// Only refresh the session while the app is open.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
