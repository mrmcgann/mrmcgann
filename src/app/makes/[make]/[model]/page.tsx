import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MakePage, indexable, makeData, makeDescription, makeFromSlug, makeTitle, modelFromSlug } from "../../MakePage";
import { env } from "@/lib/env";
import { slugify } from "@/lib/seo";

export const revalidate = 300;
// Built on first visit, then served from the cache and refreshed every 5 minutes.
export const dynamicParams = true;
export async function generateStaticParams() { return []; }

async function resolve(params: Promise<{ make: string; model: string }>) {
  const p = await params;
  const make = makeFromSlug(p.make);
  const model = make ? modelFromSlug(make, p.model) : null;
  return make && model ? { make, model } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ make: string; model: string }> }): Promise<Metadata> {
  const r = await resolve(params);
  if (!r) return { title: "Not found" };
  const d = await makeData(r.make, r.model);
  return {
    title: makeTitle(r.make, r.model), description: makeDescription(r.make, r.model, d),
    alternates: { canonical: `${env.siteUrl}/makes/${slugify(r.make)}/${slugify(r.model)}` },
    robots: indexable(d) ? undefined : { index: false, follow: true },
  };
}

export default async function ModelRoute({ params }: { params: Promise<{ make: string; model: string }> }) {
  const r = await resolve(params);
  if (!r) notFound();
  return <MakePage make={r.make} model={r.model} data={await makeData(r.make, r.model)} />;
}
