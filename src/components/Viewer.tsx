"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

// Who's looking at the page, loaded in the browser. This lets the busiest pages
// (home, vehicle pages) be served straight from the edge cache to everyone, with
// the personal parts (account menu, hearts, your bids) filled in afterwards.
// Visitors who aren't signed in cost nothing: no request is made for them.
export interface Viewer {
  ready: boolean;
  user: { id: string; email: string } | null;
  profile: Profile | null;
  missing: number[];
  watched: Set<number>;
  refresh: () => Promise<void>;
  setWatched: (id: number, on: boolean) => void;
}

const Ctx = createContext<Viewer>({ ready: false, user: null, profile: null, missing: [1, 2, 3, 4, 5], watched: new Set(), refresh: async () => {}, setWatched: () => {} });

export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Omit<Viewer, "refresh" | "setWatched">>({ ready: false, user: null, profile: null, missing: [1, 2, 3, 4, 5], watched: new Set() });
  const load = useCallback(async () => {
    try {
      const { data } = await supabaseBrowser().auth.getSession();
      if (!data.session) { setState({ ready: true, user: null, profile: null, missing: [1, 2, 3, 4, 5], watched: new Set() }); return; }
      const r = await fetch("/api/me?watched=1", { cache: "no-store" });
      const me = await r.json();
      setState({ ready: true, user: me.user, profile: me.profile, missing: me.missing || [], watched: new Set<number>(me.watched || []) });
    } catch {
      setState((s) => ({ ...s, ready: true }));
    }
  }, []);
  useEffect(() => {
    void load();
    const { data } = supabaseBrowser().auth.onAuthStateChange((event: string) => { if (event === "SIGNED_IN" || event === "SIGNED_OUT") void load(); });
    return () => data.subscription.unsubscribe();
  }, [load]);
  const setWatched = useCallback((id: number, on: boolean) => {
    setState((s) => {
      const w = new Set(s.watched);
      if (on) w.add(id); else w.delete(id);
      const profile = s.profile ? { ...s.profile, watch_count: Math.max(0, Number(s.profile.watch_count || 0) + (on ? 1 : -1)) } : s.profile;
      return { ...s, watched: w, profile };
    });
  }, []);
  return <Ctx.Provider value={{ ...state, refresh: load, setWatched }}>{children}</Ctx.Provider>;
}

export const useViewer = () => useContext(Ctx);
