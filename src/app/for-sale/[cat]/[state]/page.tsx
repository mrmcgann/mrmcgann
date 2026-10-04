import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CAT, STATE_NAMES, type CategoryKey } from "@/lib/vehicles";
import { ForSalePage, forSaleData, forSaleTitle } from "../../ForSale";

export const revalidate = 300;
const valid = (c: string, s: string): c is CategoryKey => !!CAT[c as CategoryKey] && !!STATE_NAMES[s.toUpperCase()];

export async function generateMetadata({ params }: { params: Promise<{ cat: string; state: string }> }): Promise<Metadata> {
  const { cat, state } = await params;
  if (!valid(cat, state)) return { title: "Not found" };
  const st = state.toUpperCase();
  const d = await forSaleData(cat, st);
  return {
    title: forSaleTitle(cat, st),
    description: `${CAT[cat].label} for sale by online auction in ${STATE_NAMES[st]}. Checked against the vehicle, PPSR searched, all-in prices shown.`,
    alternates: { canonical: `/for-sale/${cat}/${state.toLowerCase()}` },
    robots: d.live.length || d.sold.length ? undefined : { index: false },
  };
}

export default async function ForSaleState({ params }: { params: Promise<{ cat: string; state: string }> }) {
  const { cat, state } = await params;
  if (!valid(cat, state)) notFound();
  return <ForSalePage cat={cat} state={state.toUpperCase()} data={await forSaleData(cat, state.toUpperCase())} />;
}
