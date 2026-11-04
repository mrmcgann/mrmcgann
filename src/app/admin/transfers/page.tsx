import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { dateTime } from "@/lib/format";
import { rulesFor, isVessel, vesselFor, TRANSFER_STATUS, transportLabel } from "@/lib/transfer";

type Row = {
  id: string; invoice_id: string; lot_id: number; registration: string; rego_state: string | null; status: string; buyer_choice: string | null; transport: string | null;
  reference: string | null; proof_paths: string[]; submitted_at: string | null; seller_done_at: string | null; seller_reference: string | null; review_note: string | null; created_at: string; completed_at: string | null;
  lots: { title: string; rego_plate: string | null; vin: string | null; engine_no: string | null; odometer: number | null; category: string | null } | null;
  invoices: { ref: string; total: number | null } | null;
  profiles: { first_name: string | null; last_name: string | null; mobile: string | null; dob: string | null; street: string | null; suburb: string | null; state: string | null; postcode: string | null } | null;
};
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] : x);

// Transfer of ownership between payment and collection. Check the buyer's proof, chase the seller's
// part, and complete it; once the vehicle is at our depot the buyer books a collection there (and gets the depot's address once it's confirmed).
export default async function Transfers({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin(); // checked on every page, not just the layout
  const { status = "open" } = await searchParams;
  const db = supabaseAdmin();
  // Everything the state's form asks for, in one query, so lodging the seller's side is typing from one screen.
  let q = db.from("ownership_transfers")
    .select("*, lots(title, rego_plate, vin, engine_no, odometer, category), invoices(ref, total), profiles!ownership_transfers_buyer_id_fkey(first_name, last_name, mobile, dob, street, suburb, state, postcode)")
    .order("created_at", { ascending: true }).limit(200);
  q = status === "open" ? q.neq("status", "complete") : status === "all" ? q : q.eq("status", status);
  const { data } = await q;
  const rows = (data || []) as unknown as Row[];
  // The pickup address is admin-only and lives apart from the lot, so it is fetched apart from it too.
  const { data: privs } = rows.length
    ? await db.from("lot_private").select("lot_id, seller_name, seller_address").in("lot_id", rows.map((t) => t.lot_id))
    : { data: [] };
  const privOf = new Map(((privs || []) as { lot_id: number; seller_name: string | null; seller_address: string | null }[]).map((p) => [p.lot_id, p]));
  const paths = rows.flatMap((r) => r.proof_paths || []);
  const { data: signed } = paths.length ? await db.storage.from("transfer-docs").createSignedUrls(paths, 3600) : { data: [] };
  const link = new Map((signed || []).map((s) => [s.path, s.signedUrl]));

  return (
    <>
      <h1 className="d2">Transfers.</h1>
      <p className="muted">Registered: <b>we</b> lodge the notice of disposal as the owner&apos;s agent, from the details already on file &mdash; open &ldquo;Everything the form asks for&rdquo;, lodge it, then record it here. That releases the seller and opens the buyer&apos;s collection. The buyer&apos;s own half is theirs, chased by the clock, and holds nothing up: there is no proof to chase and nothing to verify unless they ask. Unregistered sales have nothing to lodge at all.</p>
      <div className="pill-row">{[["open", "Open"], ["submitted", "To check"], ["waiting", "Waiting"], ["complete", "Done"], ["all", "All"]].map(([s, l]) => <Link key={s} className="pill pill-soft" href={`/admin/transfers?status=${s}`} style={status === s ? { background: "var(--ink)", color: "#FFFFFF" } : undefined}>{l}</Link>)}</div>
      {rows.length === 0 && <div className="empty"><b>Nothing here.</b></div>}
      {rows.map((t) => {
        const lot = one(t.lots), inv = one(t.invoices), buyer = one(t.profiles);
        const priv = privOf.get(t.lot_id);
        const r = rulesFor(t.rego_state);
        // A boat's notice goes to the marine authority, so staff are pointed there and not at the road form.
        const v = isVessel(lot?.category) ? vesselFor(t.rego_state) : null;
        return (
          <div className="admin-card" key={t.id} style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="admin-transfer">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <b style={{ fontSize: 18 }}><Link href={`/admin/lots/${t.lot_id}`}>{lot?.title}</Link></b>
              <span className="tag" style={{ background: t.status === "submitted" ? "var(--sun)" : t.status === "complete" ? "var(--mint)" : "var(--panel)" }}>{TRANSFER_STATUS[t.status]}</span>
            </div>
            <span className="muted" style={{ fontSize: 14 }}>{inv?.ref} · buyer {buyer?.first_name} {buyer?.last_name} {buyer?.mobile} · {t.registration === "registered" ? `Registered ${lot?.rego_plate || ""} (${t.rego_state})` : `Unregistered (${t.rego_state})`} · paid {dateTime(t.created_at)}</span>
            {t.registration === "registered" && (
              <span>Notice of disposal: {t.seller_done_at
                ? <>lodged {dateTime(t.seller_done_at)}{t.seller_reference ? ` · ref ${t.seller_reference}` : ""}</>
                : <><b>we lodge this</b> as the owner&apos;s agent, then press the button below. <a className="blue" href={v ? v.sellerUrl || v.buyerUrl : r.sellerUrl} target="_blank" rel="noopener noreferrer">{v ? v.authority : r.authority} ›</a></>}</span>
            )}
            {t.registration === "registered" && !t.seller_done_at && (
              <details className="muted" style={{ fontSize: 14 }}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>Everything the form asks for</summary>
                {/* The point of the whole exercise: nobody is asked for a field we already hold. */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "6px 18px", marginTop: 8 }}>
                  {([
                    ["Plate", lot?.rego_plate], ["State", t.rego_state], ["VIN", lot?.vin], ["Engine no.", lot?.engine_no],
                    ["Odometer", lot?.odometer != null ? `${lot.odometer} km` : null],
                    ["Seller", priv?.seller_name], ["Seller address", priv?.seller_address],
                    ["Buyer", [buyer?.first_name, buyer?.last_name].filter(Boolean).join(" ")],
                    ["Buyer address", [buyer?.street, buyer?.suburb, buyer?.state, buyer?.postcode].filter(Boolean).join(" ")],
                    ["Buyer DOB", buyer?.dob], ["Buyer mobile", buyer?.mobile],
                    ["Sale date", dateTime(t.created_at)], ["Price", inv?.total != null ? `$${inv.total}` : null],
                  ] as [string, string | number | null | undefined][]).map(([k, val]) => (
                    <span key={k}><b style={{ color: "var(--ink)" }}>{k}:</b> {val || <span style={{ opacity: 0.5 }}>—</span>}</span>
                  ))}
                </div>
              </details>
            )}
            {t.submitted_at && <span>Buyer: {t.buyer_choice === "unregistered" ? `taking it unregistered (seller to cancel the rego, keep the plates) · ${transportLabel(t.transport)}` : t.buyer_choice === "transfer" ? `transferred it${t.reference ? ` · receipt ${t.reference}` : ""}` : transportLabel(t.transport)} · {dateTime(t.submitted_at)}</span>}
            {(t.proof_paths || []).length > 0 && <span className="pill-row">{t.proof_paths.map((p, k) => link.get(p) ? <a key={p} className="pill pill-soft" href={link.get(p)!} target="_blank" rel="noopener">File {k + 1} ›</a> : null)}</span>}
            {t.review_note && <span className="muted" style={{ fontSize: 14 }}>Note: {t.review_note}</span>}
            <span className="pill-row">
              <a className="pill pill-soft" href={`/api/invoices/${t.invoice_id}/certificate`} target="_blank" rel="noopener">Certificate of sale ›</a>
              {t.registration === "registered" && !t.seller_done_at && <AdminAction action="transfer-lodged" payload={{ id: t.id }} label="I've lodged the notice of disposal" input={{ name: "reference", placeholder: "Reference (optional)" }} tone="blue" confirmText="Record that you've lodged it? The seller is told it's done, and the buyer's collection opens." />}
              {t.status !== "complete" && <AdminAction action="transfer-review" payload={{ id: t.id, ok: true }} label={t.status === "submitted" ? "Checked: complete it" : "Complete it (sorted by phone)"} input={{ name: "note", placeholder: "Note (optional)" }} tone="soft" confirmText="Mark the buyer's transfer verified? Their collection doesn't depend on this." />}
              {t.status === "submitted" && <AdminAction action="transfer-review" payload={{ id: t.id, ok: false }} label="Send back" input={{ name: "note", placeholder: "What's needed (sent to the buyer)" }} tone="bad" />}
            </span>
          </div>
        );
      })}
    </>
  );
}
