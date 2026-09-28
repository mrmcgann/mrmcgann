import Link from "next/link";
import type { Lot } from "@/lib/types";
import { CarArt } from "@/components/CarArt";
import { Countdown } from "@/components/Countdown";
import { WatchButton } from "@/components/WatchButton";
import { money, km } from "@/lib/format";
import { photoUrl } from "@/lib/photos";

export function LotCard({ lot, watched, cover }: { lot: Lot; watched: boolean; cover?: string | null }) {
  const ends = lot.ends_at ? new Date(lot.ends_at).getTime() : 0;
  const soon = lot.status === "live" && ends - Date.now() < 86400000;
  const label = lot.status === "live" ? null : lot.status === "sold" ? "Sold" : lot.status === "offers" ? "Make an offer" : lot.status === "referred" ? "Under offer" : "Ended";
  return (
    <article className="card">
      <Link href={`/lot/${lot.id}`} className={`stage bg-${lot.backdrop}`} aria-label={lot.title} style={{ display: "block" }}>
        {cover ? <img className="lotimg" src={photoUrl(cover)} alt="" /> : <CarArt type={lot.vehicle_type} />}
        {label ? <span className="time ended">{label}</span> : <span className={`time${soon ? " soon" : ""}`}><Countdown endsAt={lot.ends_at} /></span>}
        <WatchButton lotId={lot.id} initial={watched} title={lot.title} />
        {lot.visual_grade && <span className="grade">Visual grade {lot.visual_grade}</span>}
        {lot.status === "live" && lot.has_reserve && !lot.reserve_met && <span className="status-tag" style={{ background: "var(--sun)", color: "var(--ink)" }}>Reserve not met</span>}
      </Link>
      <Link href={`/lot/${lot.id}`} className="meta">
        <span className="loc">{lot.suburb} {lot.state}</span>
        <span className="ttl">{lot.title}</span>
        <span className="muted">{km(lot.odometer)} · {lot.transmission} · {lot.fuel}</span>
        <span className="price">
          <b>{money(lot.status === "sold" ? lot.sold_price : lot.current_bid)}</b>
          <span className="muted">{lot.bid_count} bid{lot.bid_count === 1 ? "" : "s"}</span>
        </span>
      </Link>
    </article>
  );
}
