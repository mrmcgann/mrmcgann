import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AccountNav } from "@/app/account/AccountNav";
import { KIND_LABEL, STATUS_LABEL, slotLabel, whenLabel, type Viewing } from "@/lib/viewings";
import { CancelViewing } from "./CancelViewing";

export const metadata: Metadata = { title: "Your viewings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MyViewings() {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) redirect("/signin?next=/account/viewings");
  const { data } = await supabase.from("viewings").select("id, ref, lot_id, kind, slots, note, status, starts_at, host, staff_note, created_at, lots(title, suburb, state)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  const rows = (data || []) as unknown as (Viewing & { lots: { title: string; suburb: string; state: string } | null })[];
  const open = rows.filter((r) => ["requested", "confirmed"].includes(r.status));
  const past = rows.filter((r) => !["requested", "confirmed"].includes(r.status));
  return (
    <div className="wrap"><div className="acctgrid">
      <AccountNav current="viewings" profile={profile} />
      <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0, maxWidth: 860 }}>
        <h1 className="d2">Viewings.</h1>
        <p className="lede" style={{ margin: 0 }}>Video walkarounds and in-person viewings you&apos;ve asked for. Book one from any vehicle&apos;s page, under &quot;See it before you bid&quot;.</p>
        {open.length === 0 && <div className="empty"><b style={{ fontSize: 20 }}>Nothing booked.</b><Link className="blue" href="/auctions">Browse vehicles ›</Link></div>}
        {open.map((r) => (
          <div className="soft" key={r.id} style={{ gap: 6 }} data-testid="my-viewing">
            <b style={{ fontSize: 18 }}>{KIND_LABEL[r.kind]}: <Link className="blue" href={`/lot/${r.lot_id}`}>{r.lots?.title}</Link></b>
            {r.status === "confirmed" && r.starts_at
              ? <span><b>{whenLabel(r.starts_at)}</b> (Brisbane time). {r.kind === "video" ? "We'll video-call your verified mobile." : `Near ${r.lots?.suburb}, ${r.lots?.state}: the address is in the text and email we sent you. Bring photo ID.`}</span>
              : <span>Asked for {r.slots.map(slotLabel).join(" · ")}. We&apos;ll text you to confirm a time.</span>}
            <span className="muted" style={{ fontSize: 14 }}>Reference {r.ref} · <CancelViewing id={r.id} /></span>
          </div>
        ))}
        {past.length > 0 && (
          <div className="rows">{past.map((r) => <div key={r.id}><span className="muted">{KIND_LABEL[r.kind]} · {r.lots?.title} · {r.ref}</span><b>{STATUS_LABEL[r.status] || r.status}{r.status === "declined" && r.staff_note ? `: ${r.staff_note}` : ""}</b></div>)}</div>
        )}
      </div>
    </div></div>
  );
}
