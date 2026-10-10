import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MakePage, indexable, makeData, makeDescription, makeFromSlug, makeTitle } from "../MakePage";
import { env } from "@/lib/env";
import { slugify } from "@/lib/seo";

export const revalidate = 300;
// Built on first visit, then served from the cache and refreshed every 5 minutes.
export const dynamicParams = true;
export async function generateStaticParams() { return []; }

export async function generateMetadata({ params }: { params: Promise<{ make: string }> }): Promise<Metadata> {
  const make = makeFromSlug((await params).make);
  if (!make) return { title: "Not found" };
  const d = await makeData(make, null);
  return {
    title: makeTitle(make, null), description: makeDescription(make, null, d),
    alternates: { canonical: `${env.siteUrl}/makes/${slugify(make)}` },
    robots: indexable(d) ? undefined : { index: false, follow: true },
  };
}

export default async function MakeRoute({ params }: { params: Promise<{ make: string }> }) {
  const make = makeFromSlug((await params).make);
  if (!make) notFound();
  return <MakePage make={make} model={null} data={await makeData(make, null)} />;
}
