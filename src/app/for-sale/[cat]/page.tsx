import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CAT, type CategoryKey } from "@/lib/vehicles";
import { ForSalePage, forSaleData, forSaleTitle } from "../ForSale";

export const revalidate = 300;
const valid = (c: string): c is CategoryKey => !!CAT[c as CategoryKey];

export async function generateMetadata({ params }: { params: Promise<{ cat: string }> }): Promise<Metadata> {
  const { cat } = await params;
  if (!valid(cat)) return { title: "Not found" };
  const d = await forSaleData(cat, null);
  return {
    title: forSaleTitle(cat, null),
    description: `${CAT[cat].label} for sale by online auction across Australia. Checked against the vehicle, PPSR searched, all-in prices shown.`,
    alternates: { canonical: `/for-sale/${cat}` },
    robots: d.live.length || d.sold.length ? undefined : { index: false },
  };
}

export default async function ForSaleCat({ params }: { params: Promise<{ cat: string }> }) {
  const { cat } = await params;
  if (!valid(cat)) notFound();
  return <ForSalePage cat={cat} state={null} data={await forSaleData(cat, null)} />;
}
