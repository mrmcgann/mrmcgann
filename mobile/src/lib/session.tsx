import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { api, pub } from "./api";
import { forgetPushToken, syncPushToken } from "./push";
import type { AppConfig, Me } from "./types";

interface SessionValue {
  ready: boolean;
  session: Session | null;
  me: Me | null;
  config: AppConfig | null;
  signedIn: boolean;
  watched: Set<number>;
  refresh: () => Promise<Me | null>;
  toggleWatch: (lotId: number) => Promise<boolean>;
  signOut: () => Promise<void>;
  setUnread: (n: number) => void;
}

const Ctx = createContext<SessionValue | null>(null);

// Who's signed in, their profile and verification steps (from /api/me, the same call
// the website makes), the watchlist ids, and app settings (fees, contact details).
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [watched, setWatched] = useState<Set<number>>(new Set());
  const lastUser = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const m = await api<Me>("/api/me?watched=1");
      setMe(m);
      setWatched(new Set(m.watched || []));
      return m;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    pub<AppConfig>("/api/app/config").then(setConfig).catch(() => undefined);
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      lastUser.current = data.session?.user.id || null;
      if (data.session) { await refresh(); void syncPushToken(); }
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      const uid = s?.user.id || null;
      if (uid !== lastUser.current) {
        lastUser.current = uid;
        if (uid) { void refresh(); void syncPushToken(); }
        else { setMe(null); setWatched(new Set()); }
      }
      if (event === "SIGNED_OUT") { setMe(null); setWatched(new Set()); }
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const toggleWatch = useCallback(async (lotId: number) => {
    const on = !watched.has(lotId);
    setWatched((w) => { const n = new Set(w); if (on) n.add(lotId); else n.delete(lotId); return n; });
    try {
      await api("/api/watch", { body: { lotId, on } });
    } catch {
      setWatched((w) => { const n = new Set(w); if (on) n.delete(lotId); else n.add(lotId); return n; });
      return !on;
    }
    return on;
  }, [watched]);

  const signOut = useCallback(async () => {
    await forgetPushToken().catch(() => undefined);
    await supabase.auth.signOut().catch(() => undefined);
    setMe(null);
    setWatched(new Set());
  }, []);

  const setUnread = useCallback((n: number) => {
    setMe((m) => (m?.profile ? { ...m, profile: { ...m.profile, unread: n } } : m));
  }, []);

  const value = useMemo<SessionValue>(() => ({
    ready, session, me, config, signedIn: !!session && !!me?.user, watched, refresh, toggleWatch, signOut, setUnread,
  }), [ready, session, me, config, watched, refresh, toggleWatch, signOut, setUnread]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}

export const STEP_NAMES: Record<number, string> = { 1: "Create your account", 2: "Your details", 3: "Verify your mobile", 4: "Add a payment card", 5: "Verify your ID" };
