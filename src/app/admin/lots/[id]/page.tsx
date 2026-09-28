import { requireAdmin } from "@/lib/admin";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LotEditor, type SellerInfo } from "@/components/LotEditor";
import { env } from "@/lib/env";

export default async function EditLot({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(); // checked on every page, not just the layout
  const { id } = await params;
  const db = supabaseAdmin();
  const lotId = Number(id);
  const [{ data: lot }, { data: priv }, { data: photos }, { data: flaws }, { data: agreements }, { data: selling }, { data: snaps }] = await Promise.all([
    db.from("lots").select("*").eq("id", lotId).single(),
    db.from("lot_private").select("*").eq("lot_id", lotId).maybeSingle(),
    db.from("lot_photos").select("*").eq("lot_id", lotId).order("sort"),
    db.from("lot_flaws").select("*").eq("lot_id", lotId).order("sort"),
    db.from("seller_agreements").select("*").eq("lot_id", lotId).eq("status", "signed").order("signed_at", { ascending: false }).limit(1),
    db.from("settings").select("value").eq("key", "selling").maybeSingle(),
    db.from("lot_snapshots").select("id, reason, taken_at, data").eq("lot_id", lotId).order("taken_at", { ascending: false }).limit(3),
  ]);
  if (!lot) notFound();
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
      <LotEditor lot={lot} priv={priv} photos={photos || []} flaws={flaws || []} seller={seller} />
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
