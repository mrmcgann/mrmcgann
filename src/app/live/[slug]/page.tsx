import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFeesCached, getSettingsCached } from "@/lib/cache";
import { licenceLine } from "@/lib/licences";
import { liveRoom } from "@/lib/liveRoom";
import { env } from "@/lib/env";
import { LiveRoom } from "./LiveRoom";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const room = await liveRoom(slug).catch(() => null);
  if (!room) return { title: "Live auction not found" };
  return {
    title: `Live auction: ${room.sale.title}`,
    description: `Bid online in the ${room.sale.title} live auction. Each vehicle is offered one at a time; bid early now or join the room.`,
    alternates: { canonical: `/live/${room.sale.slug}` },
  };
}

// A live auction event: the auction's conditions first, then one vehicle at a time (its photos and the seller's video),
// a short countdown that resets on every bid and the auctioneer's calls. The rules are the database's (enter_sale,
// live_advance, admin_live_*, place_bid).
export default async function LivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [room, fees, settings] = await Promise.all([liveRoom(slug), getFeesCached(), getSettingsCached()]);
  if (!room) notFound();
  const event = {
    "@context": "https://schema.org", "@type": "Event", name: `Live auction: ${room.sale.title}`, startDate: room.sale.starts_at,
    eventStatus: "https://schema.org/EventScheduled", eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    location: { "@type": "VirtualLocation", url: `${env.siteUrl}/live/${room.sale.slug}` },
    organizer: { "@type": "Organization", name: env.legalName, url: env.siteUrl },
  };
  return (
    <div className="wrap" style={{ paddingBlock: "clamp(28px,5vw,56px)" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(event).replace(/</g, "\\u003c") }} />
      <LiveRoom initial={room} fees={fees} licences={licenceLine(settings.business, process.env.NEXT_PUBLIC_DEALER_LICENCE)}
        payDays={Number((settings.auction as { payment_days?: number } | undefined)?.payment_days) || 2} />
    </div>
  );
}
