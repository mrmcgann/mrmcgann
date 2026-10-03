import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "~/lib/supabase";
import { pub } from "~/lib/api";
import type { LiveState } from "~/lib/types";

const KEYS = ["status", "current_bid", "bid_count", "ends_at", "reserve_met", "leader_id", "decision_by", "winner_id", "sold_price", "buy_now_price"] as const;
const pick = (x: Partial<LiveState>) => {
  const o: Partial<LiveState> = {};
  for (const k of KEYS) if (x[k] !== undefined) (o as Record<string, unknown>)[k] = x[k];
  return o;
};

/**
 * The live price of one vehicle, exactly as the website does it: Supabase Realtime
 * Broadcast on "lot:<id>" (one message fanned out to every viewer), with the
 * edge-cached /api/lots/<id>/live endpoint as a fallback poll (every 2 s in the final
 * two minutes, 5 s otherwise, 30 s while Realtime is connected) and on returning to the app.
 */
export function useLive(lotId: number, initial: LiveState | null) {
  const [live, setLive] = useState<LiveState | null>(initial);
  const [skew, setSkew] = useState(0);
  const [rt, setRt] = useState(false);
  useEffect(() => { if (initial) setLive((cur) => cur || initial); }, [initial]);

  const apply = useCallback((next: Partial<LiveState>) => {
    if (next.server_time) setSkew(new Date(next.server_time).getTime() - Date.now());
    setLive((prev) => {
      if (!prev) return next as LiveState;
      const merged = { ...prev, ...pick(next) };
      // never go backwards if an older cached response lands after a newer broadcast
      if (Number(next.bid_count ?? prev.bid_count) < prev.bid_count && merged.status === prev.status) return prev;
      return merged;
    });
  }, []);

  const sync = useCallback(async () => {
    try { apply(await pub<LiveState>(`/api/lots/${lotId}/live`)); } catch { /* offline for a moment */ }
  }, [lotId, apply]);

  useEffect(() => {
    const ch = supabase.channel(`lot:${lotId}`, { config: { private: false } })
      .on("broadcast", { event: "lot" }, ({ payload }) => apply(payload as Partial<LiveState>))
      .subscribe((status) => { setRt(status === "SUBSCRIBED"); if (status === "SUBSCRIBED") void sync(); });
    void sync();
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") void sync(); });
    return () => { sub.remove(); void supabase.removeChannel(ch); };
  }, [lotId, apply, sync]);

  const endsMs = live?.ends_at ? new Date(live.ends_at).getTime() - skew : 0;
  const lastEnds = useRef(endsMs);
  lastEnds.current = endsMs;
  useEffect(() => {
    const left = endsMs - Date.now();
    const every = rt ? 30_000 : left < 120_000 ? 2_000 : 5_000;
    const t = setInterval(() => { if (AppState.currentState === "active") void sync(); }, every);
    return () => clearInterval(t);
  }, [rt, endsMs, sync]);

  return { live, apply, sync, rt, endsMs };
}
