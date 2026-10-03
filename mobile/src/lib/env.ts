import Constants from "expo-constants";

// Build-time settings (see app.config.ts). EXPO_PUBLIC_* values are baked into the app.
export const SITE = (process.env.EXPO_PUBLIC_SITE_URL || "https://tyrebiter.com.au").replace(/\/$/, "");
export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
export const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
export const APP_VERSION = Constants.expoConfig?.version || "1.0.0";
export const PROJECT_ID: string | undefined =
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId || Constants.easConfig?.projectId;

export const photoUrl = (path: string | null | undefined) =>
  !path ? null : path.startsWith("http") ? path : `${SUPABASE_URL}/storage/v1/object/public/lot-photos/${path}`;
