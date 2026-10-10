// Search engine copy and structured data (schema.org JSON-LD), built only from the listing's own facts.
// Pure: used by the pages, the sitemap, the SEO audit and the unit tests. Never invent facts, counts or
// prices: Google shows these, and the ACCC holds us to them like any other ad.
import { CAT, STATE_NAMES, canonicalMake, modelsFor } from "./vehicles.ts";
import { CHECK_KEYS } from "./listing.ts";
import type { Lot } from "./types";

export const SITE_NAME = "Tyrebiter";
/** Sales in the last 18 months count towards a make or model page (same window as the price range). */
export const SOLD_WINDOW_DAYS = 548;

const km = (n: number) => `${n.toLocaleString("en-AU")} km`;
const aud = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/[\s,.;:–-]+\S*$/, "")}…`);

/** URL-safe slug: "LandCruiser 70" → "landcruiser-70". */
export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");

type SeoLot = Pick<Lot, "id" | "title" | "status" | "year" | "make" | "model" | "variant" | "odometer" | "hours" | "transmission" | "fuel" | "suburb" | "state" | "current_bid" | "start_price" | "ends_at" | "sold_price" | "category" | "bid_count"> &
  Partial<Pick<Lot, "body" | "colour" | "drive" | "engine" | "seats" | "registration" | "runs" | "take" | "subtitle" | "verified" | "ppsr_checked_at" | "buy_now_price">>;

/** What we can truthfully say this listing was checked for (only what's recorded on it). */
export function checkedClaim(l: Pick<SeoLot, "verified" | "ppsr_checked_at">): string {
  const all = CHECK_KEYS.every((k) => (l.verified || []).includes(k));
  if (all && l.ppsr_checked_at) return "Checked against the vehicle and PPSR searched.";
  if (all) return "Checked against the vehicle.";
  if (l.ppsr_checked_at) return "PPSR searched.";
  return "";
}

/** Page title (the site name is added by the layout): year make model variant · km · place. */
export function lotSeoTitle(l: SeoLot): string {
  const name = [l.year, l.make, l.model, l.variant].filter(Boolean).join(" ") || l.title;
  const use = l.odometer != null ? km(l.odometer) : l.hours != null ? `${l.hours.toLocaleString("en-AU")} hrs` : null;
  const place = [l.suburb, l.state].filter(Boolean).join(" ");
  const prefix = l.status === "sold" ? "Sold: " : "";
  return clip([`${prefix}${name}`, use, place].filter(Boolean).join(" · "), 70);
}

/** Meta description: price (always with its all-in amount) and end date first, so they're never cut off; then what
 *  it is, where, and what we checked. Pieces are added only while they fit in 160 characters. */
export function lotSeoDescription(l: SeoLot, allIn: number | null): string {
  const name = [l.year, l.make, l.model, l.variant].filter(Boolean).join(" ") || l.title;
  const facts = [l.odometer != null ? km(l.odometer) : null, l.transmission?.toLowerCase(), l.fuel?.toLowerCase()].filter(Boolean).join(", ");
  const where = [l.suburb, l.state].filter(Boolean).join(" ");
  const price = Math.max(l.current_bid || 0, l.start_price || 0);
  const ends = l.status === "live" && l.ends_at ? `, ends ${new Date(l.ends_at).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", day: "numeric", month: "short" })}` : "";
  let money = "";
  if (l.status === "sold" && l.sold_price) money = `Sold at auction for ${aud(l.sold_price)}.`;
  else if (l.status === "live" && price && allIn) money = `${l.bid_count ? "Current bid" : "Bids from"} ${aud(price)} (${aud(allIn)} all-in)${ends}.`;
  else if (l.status === "live") money = ends ? `Online auction${ends}.` : "";
  // the name gives way (shortened) before the price ever does
  const lead = l.status === "sold" ? `${name}.` : `${name} for auction.`;
  let out = money ? `${clip(lead, 160 - money.length - 1)} ${money}` : clip(lead, 160);
  for (const p of [facts ? `${facts[0].toUpperCase()}${facts.slice(1)}.` : "", where ? `Located in ${where}.` : "", checkedClaim(l)]) {
    if (p && `${out} ${p}`.length <= 160) out = `${out} ${p}`;
  }
  return out;
}

const FUEL: Record<string, string> = { petrol: "Gasoline", diesel: "Diesel", electric: "Electric", hybrid: "Hybrid", lpg: "LPG" };
const schemaType = (cat: string | null | undefined) => (cat === "cars" || cat === "utes" || cat === "vans" ? "Car" : cat === "motorbikes" ? "Motorcycle" : cat === "buses" ? "BusOrCoach" : "Vehicle");

/** schema.org Vehicle/Car. An Offer only where there's a fixed price someone can actually pay: Buy Now, at its
 *  all-in amount. Auctions (the price changes with every bid) and sold vehicles get no offer, so search engines
 *  never show a price as if it could be bought for that. */
export function lotJsonLd(l: SeoLot, opts: { url: string; images: string[]; buyNowAllIn: number | null; siteUrl: string }) {
  const name = [l.year, l.make, l.model, l.variant].filter(Boolean).join(" ") || l.title;
  const doc: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType(l.category),
    name,
    url: opts.url,
    ...(opts.images.length ? { image: opts.images.slice(0, 10) } : {}),
    ...(l.subtitle || l.take ? { description: clip(String(l.take || l.subtitle || ""), 500) } : {}),
    ...(l.make ? { brand: { "@type": "Brand", name: l.make } } : {}),
    ...(l.model ? { model: l.model } : {}),
    ...(l.year ? { vehicleModelDate: String(l.year) } : {}),
    ...(l.odometer != null ? { mileageFromOdometer: { "@type": "QuantitativeValue", value: l.odometer, unitCode: "KMT" } } : {}),
    ...(l.transmission ? { vehicleTransmission: l.transmission } : {}),
    ...(l.fuel ? { fuelType: FUEL[l.fuel.toLowerCase()] || l.fuel } : {}),
    ...(l.colour ? { color: l.colour } : {}),
    ...(l.body ? { bodyType: l.body } : {}),
    ...(l.drive ? { driveWheelConfiguration: l.drive } : {}),
    ...(l.seats ? { seatingCapacity: l.seats } : {}),
    itemCondition: "https://schema.org/UsedCondition",
  };
  if (l.status === "live" && l.buy_now_price && opts.buyNowAllIn) {
    doc.offers = {
      "@type": "Offer",
      url: opts.url,
      priceCurrency: "AUD",
      price: Math.round(opts.buyNowAllIn),
      availability: "https://schema.org/InStock",
      ...(l.ends_at ? { priceValidUntil: l.ends_at.slice(0, 10), availabilityEnds: l.ends_at } : {}),
      itemCondition: "https://schema.org/UsedCondition",
      seller: { "@type": "Organization", name: SITE_NAME, url: opts.siteUrl },
      ...(l.state ? { areaServed: { "@type": "State", name: STATE_NAMES[l.state] || l.state } } : {}),
    };
  }
  return doc;
}

export function breadcrumbJsonLd(items: [string, string][], siteUrl: string) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${siteUrl}${path}` })),
  };
}

export function itemListJsonLd(lots: Pick<Lot, "id" | "title">[], siteUrl: string) {
  return {
    "@context": "https://schema.org", "@type": "ItemList",
    itemListElement: lots.slice(0, 30).map((l, i) => ({ "@type": "ListItem", position: i + 1, url: `${siteUrl}/lot/${l.id}`, name: l.title })),
  };
}

export function siteJsonLd(siteUrl: string, opts: { legalName: string; phone?: string; email?: string }) {
  return [
    {
      "@context": "https://schema.org", "@type": "Organization", name: SITE_NAME, legalName: opts.legalName, url: siteUrl,
      logo: `${siteUrl}/logo.png`, areaServed: "AU",
      ...(opts.phone && !opts.phone.startsWith("[") ? { contactPoint: { "@type": "ContactPoint", telephone: opts.phone, contactType: "customer service", areaServed: "AU", availableLanguage: "en" } } : {}),
      ...(opts.email ? { email: opts.email } : {}),
    },
    {
      "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: siteUrl,
      potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${siteUrl}/auctions?q={search_term_string}` }, "query-input": "required name=search_term_string" },
    },
  ];
}

/** The trail on a vehicle's page: Home › Utes › Queensland › Toyota HiLux. */
export function lotCrumbs(l: Pick<Lot, "category" | "state" | "make" | "model" | "title">): [string, string][] {
  const out: [string, string][] = [["Home", "/"]];
  const c = l.category ? CAT[l.category] : null;
  if (c) out.push([c.label, `/for-sale/${c.key}`]);
  if (c && l.state && STATE_NAMES[l.state]) out.push([STATE_NAMES[l.state], `/for-sale/${c.key}/${l.state.toLowerCase()}`]);
  // only makes and models that have a page (anything outside the catalogue would be a broken link)
  const make = canonicalMake(l.make);
  const model = make && l.model ? modelsFor(make).find((m) => m.toLowerCase() === String(l.model).toLowerCase()) : null;
  if (make) out.push([make, `/makes/${slugify(make)}`]);
  if (make && model) out.push([model, `/makes/${slugify(make)}/${slugify(model)}`]);
  return out;
}

/** Safe to put inside a <script type="application/ld+json"> tag. */
export const jsonLd = (doc: unknown) => JSON.stringify(doc).replace(/</g, "\\u003c");

/** Expected click-through rate for a Google position (rough industry curve), to spot titles that underperform. */
export function expectedCtr(position: number): number {
  const curve = [0.28, 0.15, 0.11, 0.08, 0.07, 0.05, 0.04, 0.035, 0.03, 0.025];
  if (position < 1) return curve[0];
  if (position <= 10) return curve[Math.round(position) - 1];
  return 0.01;
}
