"use client";
import { createContext, useContext } from "react";
import type { CategoryKey } from "@/lib/vehicles";

// Public settings the browser side needs, passed down once from the root layout. liveOnly: every vehicle is sold in a
// live auction (settings auction.live_only), so there's no timed auction, Buy Now, tender or offer to filter or show.
// categories and states: what we sell and where it's kept (settings selling.categories / selling.states, read with
// sellCategories() / sellStates()), so search, menus and wording offer only those.
interface Site { liveOnly: boolean; categories: CategoryKey[]; states: string[] }
const SiteSettings = createContext<Site>({ liveOnly: false, categories: ["trucks"], states: ["QLD"] });

export function SiteSettingsProvider({ liveOnly, categories = ["trucks"], states = ["QLD"], children }: { liveOnly: boolean; categories?: CategoryKey[]; states?: string[]; children: React.ReactNode }) {
  return <SiteSettings.Provider value={{ liveOnly, categories, states }}>{children}</SiteSettings.Provider>;
}

export const useLiveOnly = () => useContext(SiteSettings).liveOnly;
export const useSellCategories = () => useContext(SiteSettings).categories;
export const useSellStates = () => useContext(SiteSettings).states;
