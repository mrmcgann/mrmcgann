import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { dateTime } from "@/lib/format";
import { rulesFor, TRANSFER_STATUS, transportLabel } from "@/lib/transfer";

type Row = {
  id: string; invoice_id: string; lot_id: number; registration: string; rego_state: string | null; status: string; buyer_choice: string | null; transport: string | null;
  reference: string | null; proof_paths: string[]; submitted_at: string | null; seller_done_at: string | null; seller_reference: string | null; review_note: string | null; created_at: string; completed_at: string | null;
  lots: { title: string; rego_plate: string | null } | null; invoices: { ref: string } | null; profiles: { first_name: string | null; last_name: string | null; mobile: string | null } | null;
};
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] : x);

// Transfer of ownership between payment and collection. Check the buyer's proof, chase the seller's
// part, and complete it; the buyer can then book a collection (and gets the address once it's confirmed).
export default async function Transfers({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin(); // checked on every page, not just the layout
  const { status = "open" } = await searchParams;
  const db = supabaseAdmin();
  let q = db.from("ownership_transfers").select("*, lots(title, rego_plate), invoices(ref), profiles!ownership_transfers_buyer_id_fkey(first_name, last_name, mobile)").order("created_at", { ascending: true }).limit(200);
  q = status === "open" ? q.neq("status", "complete") : status === "all" ? q : q.eq("status", status);
  const { data } = await q;
  const rows = (data || []) as unknown as Row[];
  const paths = rows.flatMap((r) => r.proof_paths || []);
  const { data: signed } = paths.length ? await db.storage.from("transfer-docs").createSignedUrls(paths, 3600) : { data: [] };
  const link = new Map((signed || []).map((s) => [s.path, s.signedUrl]));

  return (
    <>
      <h1 className="d2">Transfers.</h1>
      <p className="muted">Between payment and collection. Registered: the seller lodges their part, the buyer transfers the registration and uploads the confirmation; check the buyer&apos;s name, the plate and the VIN, then complete it. Unregistered sales complete when the buyer confirms the certificate of sale.</p>
      <div className="pill-row">{[["open", "Open"], ["submitted", "To check"], ["waiting", "Waiting"], ["complete", "Done"], ["all", "All"]].map(([s, l]) => <Link key={s} className="pill pill-soft" href={`/admin/transfers?status=${s}`} style={status === s ? { background: "var(--ink)", color: "#FFFFFF" } : undefined}>{l}</Link>)}</div>
      {rows.length === 0 && <div className="empty"><b>Nothing here.</b></div>}
      {rows.map((t) => {
        const lot = one(t.lots), inv = one(t.invoices), buyer = one(t.profiles);
        const r = rulesFor(t.rego_state);
        return (
          <div className="admin-card" key={t.id} style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="admin-transfer">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <b style={{ fontSize: 18 }}><Link href={`/admin/lots/${t.lot_id}`}>{lot?.title}</Link></b>
              <span className="tag" style={{ background: t.status === "submitted" ? "var(--sun)" : t.status === "complete" ? "var(--mint)" : "var(--panel)" }}>{TRANSFER_STATUS[t.status]}</span>
            </div>
            <span className="muted" style={{ fontSize: 14 }}>{inv?.ref} · buyer {buyer?.first_name} {buyer?.last_name} {buyer?.mobile} · {t.registration === "registered" ? `Registered ${lot?.rego_plate || ""} (${t.rego_state})` : `Unregistered (${t.rego_state})`} · paid {dateTime(t.created_at)}</span>
            {t.registration === "registered" && <span>Seller: {t.seller_done_at ? <>lodged {dateTime(t.seller_done_at)}{t.seller_reference ? ` · ref ${t.seller_reference}` : ""}</> : <>not yet. {r.seller} <a className="blue" href={r.sellerUrl} target="_blank" rel="noopener noreferrer">{r.authority} ›</a></>}</span>}
            {t.submitted_at && <span>Buyer: {t.buyer_choice === "unregistered" ? `taking it unregistered (seller to cancel the rego, keep the plates) · ${transportLabel(t.transport)}` : t.buyer_choice === "transfer" ? `transferred it${t.reference ? ` · receipt ${t.reference}` : ""}` : transportLabel(t.transport)} · {dateTime(t.submitted_at)}</span>}
            {(t.proof_paths || []).length > 0 && <span className="pill-row">{t.proof_paths.map((p, k) => link.get(p) ? <a key={p} className="pill pill-soft" href={link.get(p)!} target="_blank" rel="noopener">File {k + 1} ›</a> : null)}</span>}
            {t.review_note && <span className="muted" style={{ fontSize: 14 }}>Note: {t.review_note}</span>}
            <span className="pill-row">
              <a className="pill pill-soft" href={`/api/invoices/${t.invoice_id}/certificate`} target="_blank" rel="noopener">Certificate of sale ›</a>
              {t.status !== "complete" && t.registration === "registered" && !t.seller_done_at && <AdminAction action="transfer-seller-done" payload={{ lotId: t.lot_id }} label="Seller's part done" input={{ name: "reference", placeholder: "Reference (optional)" }} tone="soft" />}
              {t.status !== "complete" && <AdminAction action="transfer-review" payload={{ id: t.id, ok: true }} label={t.status === "submitted" ? "Checked: complete it" : "Complete it (sorted by phone)"} input={{ name: "note", placeholder: "Note (optional)" }} tone="blue" confirmText="Mark ownership done? The buyer can then book collection." />}
              {t.status === "submitted" && <AdminAction action="transfer-review" payload={{ id: t.id, ok: false }} label="Send back" input={{ name: "note", placeholder: "What's needed (sent to the buyer)" }} tone="bad" />}
            </span>
          </div>
        );
      })}
    </>
  );
}
