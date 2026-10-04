import { requireAdmin } from "@/lib/admin";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import Link from "next/link";
import { LotEditor, type SellerInfo } from "@/components/LotEditor";
import { AdminAction } from "@/components/AdminAction";
import { money } from "@/lib/format";
import { env } from "@/lib/env";

export default async function EditLot({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(); // checked on every page, not just the layout
  const { id } = await params;
  const db = supabaseAdmin();
  const lotId = Number(id);
  const [{ data: lot }, { data: priv }, { data: photos }, { data: flaws }, { data: agreements }, { data: selling }, { data: snaps }, { data: videos }] = await Promise.all([
    db.from("lots").select("*").eq("id", lotId).single(),
    db.from("lot_private").select("*").eq("lot_id", lotId).maybeSingle(),
    db.from("lot_photos").select("*").eq("lot_id", lotId).order("sort"),
    db.from("lot_flaws").select("*").eq("lot_id", lotId).order("sort"),
    db.from("seller_agreements").select("*").eq("lot_id", lotId).eq("status", "signed").order("signed_at", { ascending: false }).limit(1),
    db.from("settings").select("value").eq("key", "selling").maybeSingle(),
    db.from("lot_snapshots").select("id, reason, taken_at, data").eq("lot_id", lotId).order("taken_at", { ascending: false }).limit(3),
    db.from("lot_videos").select("id, status, public_path, title").eq("lot_id", lotId).in("status", ["pending", "approved"]),
  ]);
  if (!lot) notFound();
  const [{ data: corrections }, { data: maxes }, { data: cancelled }, { data: offers }, { data: relisted }] = await Promise.all([
    db.from("lot_corrections").select("label, before, after, created_at").eq("lot_id", lotId).order("created_at", { ascending: false }).limit(50),
    lot.status === "live" ? db.from("max_bids").select("bidder_id, max_amount, first_set_at, profiles(first_name, last_name, mobile)").eq("lot_id", lotId).order("max_amount", { ascending: false }) : Promise.resolve({ data: [] }),
    db.from("invoices").select("id, ref").eq("lot_id", lotId).eq("status", "cancelled").limit(1),
    db.from("second_chance_offers").select("id, amount, status, expires_at, created_at, profiles!second_chance_offers_user_id_fkey(first_name, last_name)").eq("lot_id", lotId).order("created_at", { ascending: false }),
    db.from("lots").select("id, status").eq("relisted_from", lotId).neq("status", "cancelled").limit(1),
  ]);
  type Who = { first_name: string | null; last_name: string | null; mobile?: string | null } | null;
  const name = (p: Who) => (p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : "Member");
  const agreement = agreements?.[0] || null;
  const sellerId = (lot.seller_id as string | null) || null;
  const [{ data: sp }, { data: bank }] = await Promise.all([
    sellerId ? db.from("profiles").select("first_name, last_name, id_status").eq("id", sellerId).single() : Promise.resolve({ data: null }),
    sellerId ? db.from("seller_bank").select("*").eq("seller_id", sellerId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const paths: string[] = agreement?.doc_paths || [];
  const { data: signed } = paths.length ? await db.storage.from("seller-docs").createSignedUrls(paths, 3600) : { data: [] };
  const seller: SellerInfo = {
    inviteUrl: priv?.seller_invite ? `${env.siteUrl}/sell/agreement/${priv.seller_invite}` : null,
    sellerName: sp ? `${sp.first_name || ""} ${sp.last_name || ""}`.trim() : null,
    idVerified: sp?.id_status === "verified",
    agreement: agreement ? { signed_name: agreement.signed_name, signed_at: agreement.signed_at, reserve_price: agreement.reserve_price, disclosures: agreement.disclosures, gst_registered: agreement.gst_registered, abn: agreement.abn, owner_type: agreement.owner_type, version: agreement.version } : null,
    docs: paths.map((p, i) => ({ path: p, url: (signed || [])[i]?.signedUrl || null })),
    bank: bank ? { account_name: bank.account_name, bsb: bank.bsb, account_number: bank.account_number, confirmed_at: bank.confirmed_at } : null,
    sellerId,
    ownershipCheckedAt: priv?.ownership_checked_at || null,
    requireChecks: (selling?.value as { require_checks?: boolean } | null)?.require_checks !== false,
  };
  return (
    <>
      <LotEditor lot={lot} priv={priv} photos={photos || []} flaws={flaws || []} seller={seller} videos={videos || []} />
      {(lot.status === "live" && (maxes || []).length > 0) && (
        <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="admin-bidders">
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Bidders</h2>
          <p className="hint">Remove a bidder&apos;s bids only for a good reason: they bid before a material correction and asked out, or shill bidding. The price is worked out again from the other bids, and the bidder is told the reason.</p>
          {(maxes || []).map((m) => {
            const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as Who;
            return (
              <div key={m.bidder_id} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
                <span><b>{name(p)}</b> <span className="muted">{p?.mobile} · max {money(m.max_amount)}</span></span>
                <AdminAction action="remove-bidder" payload={{ lotId, userId: m.bidder_id }} label="Remove their bids" input={{ name: "reason", placeholder: "Reason (sent to the bidder)" }} tone="bad" />
              </div>
            );
          })}
        </div>
      )}
      {["passed", "cancelled"].includes(lot.status) && (
        <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="admin-after">
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Didn&apos;t sell</h2>
          {lot.status === "passed" && (cancelled || []).length > 0 && (
            <>
              <p className="hint">The buyer didn&apos;t pay ({cancelled![0].ref}). Offer it to the next highest bidder at their highest bid. They have 24 hours to accept; it&apos;s binding once they do.</p>
              <span className="pill-row">
                <AdminAction action="next-bidder" payload={{ lotId }} label="Offer to the next bidder" confirmText="Send the offer?" tone="blue" />
                <AdminAction action="next-bidder" payload={{ lotId, sellerOk: true }} label="Offer below the reserve (seller agreed)" confirmText="The seller agreed to sell below the reserve?" tone="soft" />
              </span>
            </>
          )}
          {(offers || []).map((o) => {
            const p = (Array.isArray(o.profiles) ? o.profiles[0] : o.profiles) as Who;
            return <span key={o.id}>Offer to {name(p)} at {money(o.amount)}: <b>{o.status === "pending" && new Date(o.expires_at) < new Date() ? "expired" : o.status}</b> <span className="muted">(until {new Date(o.expires_at).toLocaleString("en-AU")})</span></span>;
          })}
          {(relisted || []).length ? <span>Relisted as <Link className="blue" href={`/admin/lots/${relisted![0].id}`}>lot {relisted![0].id}</Link> ({relisted![0].status}).</span>
            : <span className="pill-row"><AdminAction action="relist" payload={{ lotId }} label="Relist as a new draft" confirmText="Copy it to a new draft? Re-run the PPSR and the listing checks before publishing." tone="dark" /></span>}
        </div>
      )}
      {(corrections || []).length > 0 && (
        <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Corrections shown on the listing</h2>
          {(corrections || []).map((c, i) => <span key={i} style={{ fontSize: 14 }}><b>{c.label}</b>: {c.before} → {c.after} <span className="muted">{new Date(c.created_at).toLocaleString("en-AU")}</span></span>)}
        </div>
      )}
      {(snaps || []).length > 0 && (
        <div className="admin-card">
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Listing as sold (snapshot)</h2>
          <p className="hint">Frozen at the moment of sale. Use it to decide buyer claims.</p>
          {(snaps || []).map((s) => (
            <details key={s.id}><summary style={{ cursor: "pointer", fontWeight: 700 }}>{s.reason} · {new Date(s.taken_at).toLocaleString("en-AU")}</summary>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, maxHeight: 400, overflow: "auto" }}>{JSON.stringify(s.data, null, 2)}</pre></details>
          ))}
        </div>
      )}
    </>
  );
}
