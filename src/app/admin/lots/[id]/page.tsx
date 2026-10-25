import { requireAdmin } from "@/lib/admin";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import Link from "next/link";
import { LotEditor, type SellerInfo } from "@/components/LotEditor";
import { AdminAction } from "@/components/AdminAction";
import { dateTime, money } from "@/lib/format";
import { relistSteps } from "@/lib/relist";
import { env } from "@/lib/env";
import { afterStatusLabel, type AfterRule } from "@/lib/afterAuction";
import { AfterSale, type AfterPerson } from "./AfterSale";

export default async function EditLot({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireAdmin(); // checked on every page, not just the layout
  const { id } = await params;
  const db = supabaseAdmin();
  const lotId = Number(id);
  const [{ data: lot }, { data: priv }, { data: photos }, { data: flaws }, { data: agreements }, { data: selling }, { data: snaps }, { data: videos }] = await Promise.all([
    db.from("lots").select("*").eq("id", lotId).single(),
    db.from("lot_private").select("*").eq("lot_id", lotId).maybeSingle(),
    db.from("lot_photos").select("*").eq("lot_id", lotId).order("sort"),
    db.from("lot_flaws").select("*").eq("lot_id", lotId).order("sort"),
    db.from("seller_agreements").select("*").eq("lot_id", lotId).eq("status", "signed").order("signed_at", { ascending: false }).limit(1),
    db.from("settings").select("key, value").in("key", ["selling", "auction"]),
    db.from("lot_snapshots").select("id, reason, taken_at, data").eq("lot_id", lotId).order("taken_at", { ascending: false }).limit(3),
    db.from("lot_videos").select("id, status, public_path, title").eq("lot_id", lotId).in("status", ["pending", "approved"]),
  ]);
  if (!lot) notFound();
  const settingRows = (selling || []) as { key: string; value: Record<string, unknown> }[];
  const sellingSet = settingRows.find((r) => r.key === "selling") || null;
  // live auctions only: below the reserve it's passed in; it can then be sold after the auction by agreement where its
  // state allows it (migration 26), or it goes into the next auction
  const liveOnly = settingRows.find((r) => r.key === "auction")?.value?.live_only === true;
  const [{ data: corrections }, { data: maxes }, { data: cancelled }, { data: offers }, { data: relisted }, { data: saidNo }, { data: from }] = await Promise.all([
    db.from("lot_corrections").select("label, before, after, created_at").eq("lot_id", lotId).order("created_at", { ascending: false }).limit(50),
    lot.status === "live" ? db.from("max_bids").select("bidder_id, max_amount, first_set_at, profiles(first_name, last_name, mobile)").eq("lot_id", lotId).order("max_amount", { ascending: false }) : Promise.resolve({ data: [] }),
    db.from("invoices").select("id, ref").eq("lot_id", lotId).eq("status", "cancelled").limit(1),
    db.from("second_chance_offers").select("id, kind, amount, status, expires_at, created_at, cooling_off_until, warranty, warranty_text, consultant, cancel_reason, signed_name, invoice_id, docs, profiles!second_chance_offers_user_id_fkey(first_name, last_name)").eq("lot_id", lotId).order("created_at", { ascending: false }),
    db.from("lots").select("id, status, sale_id").eq("relisted_from", lotId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1),
    db.from("seller_decisions").select("via, created_at").eq("lot_id", lotId).eq("action", "decline_relist").limit(1),
    // a relist draft: the vehicle it came from (where bidding stopped, its reserve) and the auction it's going into
    lot.relisted_from ? db.from("lots").select("id, title, current_bid, bid_count, not_offered").eq("id", lot.relisted_from).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const { data: relistSale } = lot.relisted_from && lot.sale_id ? await db.from("sales").select("title, starts_at").eq("id", lot.sale_id).maybeSingle() : { data: null };
  // (lots and sales are linked both ways, so each is read on its own rather than embedded)
  const again = (relisted || [])[0] as { id: number; status: string; sale_id: number | null } | undefined;
  const { data: againSale } = again?.sale_id ? await db.from("sales").select("title, starts_at").eq("id", again.sale_id).maybeSingle() : { data: null };
  const no = (saidNo || [])[0] as { via: string; created_at: string } | undefined;
  const origin = from as { id: number; title: string; current_bid: number; bid_count: number; not_offered: boolean } | null;
  const { data: originPriv } = origin ? await db.from("lot_private").select("reserve_price").eq("lot_id", origin.id).maybeSingle() : { data: null };
  const originReserve = (originPriv as { reserve_price: number | null } | null)?.reserve_price ?? null;
  type Who = { first_name: string | null; last_name: string | null; mobile?: string | null } | null;
  const name = (p: Who) => (p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : "Member");
  // selling it after the auction: whether its state allows it now, the seller's written price, and who can be offered it
  const afterOn = liveOnly && lot.status === "passed";
  const afterRows: { data: unknown }[] = afterOn ? await Promise.all([
    db.rpc("after_auction_check", { p_lot: lotId }),
    db.from("max_bids").select("bidder_id, max_amount, profiles(first_name, last_name, mobile)").eq("lot_id", lotId),
    db.from("bids").select("bidder_id, amount").eq("lot_id", lotId).order("amount", { ascending: false }).limit(500),
    db.from("watchlist").select("user_id, profiles(first_name, last_name, mobile)").eq("lot_id", lotId).limit(200),
    db.from("seller_decisions").select("action, amount, via, note, created_at").eq("lot_id", lotId).in("action", ["accept_after", "withdraw_after"]).order("created_at", { ascending: false }).limit(5),
  ]) : [];
  const [chk, maxRows, bidRows, watchRows, decs] = [0, 1, 2, 3, 4].map((i) => afterRows[i]?.data ?? null);
  const check = chk as { ok: boolean; why: string | null; state: string | null; rule: AfterRule } | null;
  const lastDec = ((decs || []) as { action: string; amount: number | null; via: string; note: string | null; created_at: string }[])[0];
  const sellerPrice = lastDec?.action === "accept_after" ? Number(lastDec.amount) : null;
  const people: AfterPerson[] = [];
  const one = (p: unknown) => (Array.isArray(p) ? p[0] : p) as Who;
  for (const m of (maxRows || []) as { bidder_id: string; max_amount: number; profiles: unknown }[]) {
    const top = ((bidRows || []) as { bidder_id: string; amount: number }[]).find((x) => x.bidder_id === m.bidder_id);
    people.push({ id: m.bidder_id, name: name(one(m.profiles)), mobile: one(m.profiles)?.mobile ?? null, bid: top ? Number(top.amount) : null, watcher: false, leader: m.bidder_id === lot.leader_id });
  }
  for (const w of (watchRows || []) as { user_id: string; profiles: unknown }[]) {
    const p = people.find((x) => x.id === w.user_id);
    if (p) p.watcher = true;
    else if (w.user_id !== lot.seller_id) people.push({ id: w.user_id, name: name(one(w.profiles)), mobile: one(w.profiles)?.mobile ?? null, bid: null, watcher: true, leader: false });
  }
  people.sort((a, b) => Number(b.leader) - Number(a.leader) || (b.bid ?? -1) - (a.bid ?? -1));
  const afterOpen = ((offers || []) as { kind: string; status: string; expires_at: string }[]).some((o) => o.status === "cooling_off" || (o.status === "pending" && new Date(o.expires_at) > new Date()));
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
    requireChecks: (sellingSet?.value as { require_checks?: boolean } | null)?.require_checks !== false,
  };
  return (
    <>
      {lot.relisted_from && lot.status === "draft" && (
        <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="admin-relist">
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Going back into auction</h2>
          <p className="hint" style={{ margin: 0 }}>Relisted from <Link className="blue" href={`/admin/lots/${lot.relisted_from}`}>lot {lot.relisted_from}</Link>
            {origin ? <>, which {origin.not_offered ? "wasn't offered before the auction finished" : origin.bid_count ? `was passed in at ${money(origin.current_bid)}` : "had no bids"}{originReserve != null ? ` (reserve ${money(originReserve)})` : ""}</> : null}.
            It goes into the next auction, unless it&apos;s sold after the auction first where its state allows it (from lot {lot.relisted_from}&apos;s page; this listing can&apos;t go live while an offer there is open). Before it can go live:</p>
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 15 }}>
            {relistSteps({ state: lot.state, regoState: lot.rego_state, registration: lot.registration, year: lot.year, category: lot.category, gvm: lot.gvm_kg,
              saleTitle: relistSale?.title ?? null, saleAt: relistSale?.starts_at ?? null, signedAt: agreement?.signed_at ?? null, passedAt: origin?.bid_count && !origin.not_offered ? Number(origin.current_bid) : null, notOffered: !!origin?.not_offered })
              .map((st, i) => <li key={i} style={st.warn ? { color: "var(--urgent)", fontWeight: 600 } : undefined}>{st.text}</li>)}
          </ul>
          <span className="pill-row"><AdminAction action="relist-decline" payload={{ lotId }} label="The seller doesn't want it offered again" confirmText="Cancel this relist? The seller keeps the vehicle; there's no fee while it's a draft." tone="soft" /></span>
        </div>
      )}
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
      {lot.status === "sold" && lot.sold_via === "after_auction" && (
        <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="admin-sold-after">
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Sold after the auction</h2>
          {((offers || []) as { id: string; kind: string; status: string; amount: number; signed_name: string | null; consultant: string | null; warranty: boolean | null; warranty_text: string | null; docs: { name: string }[] | null; profiles: unknown }[])
            .filter((o) => o.kind === "after_auction" && o.status === "accepted").map((o) => (
              <span key={o.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 15 }}>
                <span>To {name((Array.isArray(o.profiles) ? o.profiles[0] : o.profiles) as Who)} at {money(o.amount)}, signed by {o.signed_name || "the buyer"}, for us by {o.consultant}. <span className="muted">{o.warranty ? `Statutory warranty: ${o.warranty_text}` : "No statutory warranty."}</span></span>
                <a className="blue" href={`/api/offers/${o.id}/contract`} target="_blank" rel="noreferrer">Contract</a>
                {(o.docs || []).map((d, i) => <a key={i} className="blue" href={`/api/offers/${o.id}/doc?i=${i}`} target="_blank" rel="noreferrer">{d.name.split(":")[0]}</a>)}
              </span>
            ))}
        </div>
      )}
      {["passed", "cancelled"].includes(lot.status) && (
        <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="admin-after">
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Didn&apos;t sell</h2>
          {lot.status === "passed" && (cancelled || []).length > 0 && liveOnly && <p className="hint">The buyer didn&apos;t pay ({cancelled![0].ref}). Where its state allows it, you can offer it to another bidder after the auction (below), with the seller&apos;s written agreement to the price; otherwise relist it for a later auction.</p>}
          {lot.status === "passed" && (cancelled || []).length > 0 && !liveOnly && (
            <>
              <p className="hint">The buyer didn&apos;t pay ({cancelled![0].ref}). Offer it to the next highest bidder at their highest bid. They have 24 hours to accept; it&apos;s binding once they do.</p>
              <span className="pill-row">
                <AdminAction action="next-bidder" payload={{ lotId }} label="Offer to the next bidder" confirmText="Send the offer?" tone="blue" />
                <AdminAction action="next-bidder" payload={{ lotId, sellerOk: true }} label="Offer below the reserve (seller agreed)" confirmText="The seller agreed to sell below the reserve?" tone="soft" />
              </span>
            </>
          )}
          {afterOn && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 12 }} data-testid="admin-after-sale">
              <h3 style={{ fontSize: 19, fontWeight: 800 }}>Sell it after the auction</h3>
              {check?.ok
                ? <AfterSale lotId={lotId} rule={check.rule} sellerPrice={sellerPrice} people={people} consultant={`${profile?.first_name || ""} ${profile?.last_name || ""}`.trim()} offerOpen={afterOpen}
                    facts={{ state: check.state, year: lot.year ?? null, odometer: lot.odometer ?? null, category: lot.category ?? null, gvm: lot.gvm_kg ?? null }} />
                : <span className="hint" style={{ margin: 0 }} data-testid="admin-after-closed">It can&apos;t be sold after the auction: {check?.why || "it isn't available"}</span>}
              {lastDec && <span className="muted" style={{ fontSize: 14 }}>The seller {lastDec.action === "accept_after" ? `agreed to ${money(lastDec.amount)} or more` : "withdrew their price"} ({lastDec.via === "admin" ? `recorded by staff: ${lastDec.note || ""}` : "from their seller dashboard"}, {dateTime(lastDec.created_at)}).</span>}
            </div>
          )}
          {(offers || []).map((o) => {
            const p = (Array.isArray(o.profiles) ? o.profiles[0] : o.profiles) as Who;
            const after = o.kind === "after_auction";
            const live = o.status === "pending" && new Date(o.expires_at) > new Date();
            return (
              <span key={o.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }} data-testid="admin-offer-row">
                <span>{after ? "After-auction offer" : "Offer"} to {name(p)} at {money(o.amount)}: <b>{after ? afterStatusLabel(o) : o.status === "pending" && new Date(o.expires_at) < new Date() ? "expired" : o.status}</b>{" "}
                  <span className="muted">{o.status === "cooling_off" && o.cooling_off_until ? `(cooling-off until ${dateTime(o.cooling_off_until)})` : o.status === "pending" ? `(until ${dateTime(o.expires_at)})` : o.cancel_reason ? `(${o.cancel_reason === "cooling_off" ? "cancelled in the cooling-off period" : o.cancel_reason})` : ""}</span>
                  {after && <span className="muted"> · {o.warranty ? `warranty: ${o.warranty_text}` : "no statutory warranty"} · signed for us by {o.consultant}{o.signed_name ? ` · signed by ${o.signed_name}` : ""}</span>}
                  {o.invoice_id && <span className="muted"> · invoiced</span>}
                </span>
                {after && live && <AdminAction action="after-withdraw" payload={{ offerId: o.id }} label="Withdraw" input={{ name: "reason", placeholder: "Why (sent to the buyer)" }} tone="soft" />}
                {after && <a className="blue" href={`/api/offers/${o.id}/contract`} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>Contract</a>}
              </span>
            );
          })}
          {again ? (
            <>
              <span data-testid="admin-relisted">Relisted as <Link className="blue" href={`/admin/lots/${again.id}`}>lot {again.id}</Link> ({again.status === "draft" ? "a draft" : again.status}){againSale ? <> for {againSale.title} on {dateTime(againSale.starts_at)}</> : again.status === "draft" ? ", not in an auction yet" : ""}.</span>
              {again.status === "draft" && <span className="pill-row"><AdminAction action="relist-decline" payload={{ lotId }} label="The seller doesn't want it offered again" confirmText="Cancel the relist? The seller keeps the vehicle; there's no fee while it's a draft." tone="soft" /></span>}
            </>
          ) : (
            <>
              {no ? <span data-testid="admin-relist-no">The seller doesn&apos;t want it offered again ({no.via === "admin" ? "recorded by staff" : "from their seller dashboard"}, {dateTime(no.created_at)}). If they change their mind, relist it.</span>
                : <span className="hint" style={{ margin: 0 }}>Relist it for the next auction once you&apos;ve spoken to the seller{check?.ok ? ", unless you sell it after the auction first (above)" : ""}.</span>}
              <span className="pill-row">
                <AdminAction action="relist" payload={{ lotId }} label="Relist as a new draft" confirmText="Copy it to a new draft? Re-run the PPSR and the listing checks before publishing." tone="dark" />
                {!no && <AdminAction action="relist-decline" payload={{ lotId }} label="The seller doesn't want it offered again" confirmText="Record that the seller doesn't want it offered again?" tone="soft" />}
              </span>
            </>
          )}
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
