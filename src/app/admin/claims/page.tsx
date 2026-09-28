import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { dateTime, money } from "@/lib/format";

const REASON: Record<string, string> = { identity: "Wrong make/model/year/VIN", transmission_fuel: "Wrong transmission or fuel", write_off_stolen: "Undisclosed write-off/stolen", finance: "Undisclosed finance", odometer: "Odometer", missing_feature: "Listed feature missing", undisclosed_damage: "Undisclosed major damage", other: "Other" };

export default async function Claims({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "open" } = await searchParams;
  const db = supabaseAdmin();
  let q = db.from("claims").select("*, lots(id, title), invoices(ref, price, collected_at, claim_until), profiles(first_name, last_name, mobile, email)").order("created_at", { ascending: false }).limit(200);
  if (status !== "all") q = q.eq("status", status);
  const { data } = await q;
  const paths = (data || []).flatMap((c) => c.photo_paths || []);
  const { data: urls } = paths.length ? await db.storage.from("claim-photos").createSignedUrls(paths, 3600) : { data: [] };
  const url = new Map((urls || []).map((u: { path: string | null; signedUrl: string | null }) => [u.path, u.signedUrl || undefined]));
  return (
    <>
      <h1 className="d2">Claims.</h1>
      <p className="muted">Compare each claim with the listing snapshot taken at the moment of sale (Vehicles → the lot → Snapshot). The seller&apos;s payout is on hold while a claim is open. Aim to decide within 2 business days.</p>
      <div className="pill-row">{["open", "upheld", "rejected", "all"].map((s) => <Link key={s} className="pill pill-soft" href={`/admin/claims?status=${s}`} style={status === s ? { background: "var(--ink)", color: "#FFFFFF" } : undefined}>{s}</Link>)}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {(data || []).map((c) => {
          const lot = (Array.isArray(c.lots) ? c.lots[0] : c.lots) as { id: number; title: string } | null;
          const inv = (Array.isArray(c.invoices) ? c.invoices[0] : c.invoices) as { ref: string; price: number; collected_at: string | null } | null;
          const b = (Array.isArray(c.profiles) ? c.profiles[0] : c.profiles) as { first_name: string; last_name: string; mobile: string; email: string } | null;
          return (
            <div className="admin-card" key={c.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <b>{REASON[c.reason] || c.reason} · <Link href={`/admin/lots/${lot?.id}`}>{lot?.title}</Link> · {inv?.ref} ({money(inv?.price)})</b>
              <span className="muted">{b?.first_name} {b?.last_name} · {b?.mobile} · {b?.email} · lodged {dateTime(c.created_at)} · {inv?.collected_at ? `collected ${dateTime(inv.collected_at)}` : "before collection"}</span>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{c.details}</p>
              {(c.photo_paths || []).length > 0 && <div className="pill-row">{(c.photo_paths as string[]).map((p) => url.get(p) && <a key={p} href={url.get(p)} target="_blank" rel="noreferrer"><img src={url.get(p)} alt="" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 10 }} /></a>)}</div>}
              {c.status === "open" ? (
                <span className="pill-row">
                  <AdminAction action="claim" payload={{ claimId: c.id, status: "upheld" }} label="Uphold" input={{ name: "resolution", placeholder: "Remedy: full refund / price adjustment…" }} tone="blue" />
                  <AdminAction action="claim" payload={{ claimId: c.id, status: "rejected" }} label="Reject" input={{ name: "resolution", placeholder: "Why (shown to the buyer)" }} tone="bad" />
                </span>
              ) : <span><span className="status-pill">{c.status}</span> {c.resolution}</span>}
            </div>
          );
        })}
        {(data || []).length === 0 && <div className="admin-card muted">Nothing here.</div>}
      </div>
    </>
  );
}
