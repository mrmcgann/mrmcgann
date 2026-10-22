"use client";
import { createContext, useContext } from "react";

// Public settings the browser side needs, passed down once from the root layout. liveOnly: every vehicle is sold in a
// live auction (settings auction.live_only), so there's no timed auction, Buy Now, tender or offer to filter or show.
const SiteSettings = createContext<{ liveOnly: boolean }>({ liveOnly: false });

export function SiteSettingsProvider({ liveOnly, children }: { liveOnly: boolean; children: React.ReactNode }) {
  return <SiteSettings.Provider value={{ liveOnly }}>{children}</SiteSettings.Provider>;
}

export const useLiveOnly = () => useContext(SiteSettings).liveOnly;
