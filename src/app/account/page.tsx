import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, missingSteps } from "@/lib/auth";
import { Tick } from "@/components/CarArt";
import { NotifySettings } from "@/components/NotifySettings";
import { AccountExtras } from "./AccountExtras";
import { maskMobile, money, dateLong } from "@/lib/format";

export const metadata: Metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

const INV_TAG: Record<string, [string, string]> = {
  pending_charge: ["var(--sun)", "Processing"], paid: ["var(--mint)", "Paid"], deposit_paid: ["var(--sun)", "Balance due"],
  payment_failed: ["var(--berry)", "Payment failed"], cancelled: ["var(--panel2)", "Cancelled"],
};

export default async function Account() {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) redirect("/signin?next=/account");
  const miss = missingSteps(profile);
  const [{ data: invoices }, { data: appraisals }] = await Promise.all([
    supabase.from("invoices").select("*, lots(title)").eq("buyer_id", user.id).order("created_at", { ascending: false }),
    supabase.from("appraisals").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);
  const row = (n: number, label: string, ok: boolean, detail: string) => (
    <div className="check" style={{ padding: "18px 0" }} key={n}>
      <span className="tick" style={{ background: ok ? "var(--mint)" : "var(--panel2)" }}>{ok ? <Tick /> : <b style={{ fontSize: 13 }}>{n}</b>}</span>
      <span style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}><b>{label}</b><span className="muted" style={{ fontSize: 14 }}>{detail}</span></span>
      {n > 1 && <Link className={`btn ${ok ? "btn-soft" : "btn-blue"}`} href={`/join?step=${n}&next=/account`} style={{ height: 42, fontSize: 14, padding: "0 18px" }}>{ok ? "Update" : "Finish"}</Link>}
    </div>
  );
  const STEPS: [string, string, string][] = [["new", "Appraisal requested", ""], ["contacted", "We've called you", ""], ["booked", "Photos booked", ""], ["listed", "Listed for auction", ""], ["closed", "Finished", ""]];

  return (
    <div className="wrap">
      <div className="acctgrid">
        <nav className="side-nav" aria-label="Account">
          <span className="h">Buying</span><Link href="/watchlist">Watchlist</Link><Link href="/watchlist?f=winning">My bids</Link>
          <span className="h">Account</span><Link href="/account" className="on">Account &amp; verification</Link><Link href="/account#invoices">Invoices</Link><Link href="/account/notifications">Notifications{profile.unread ? <span>{profile.unread}</span> : null}</Link><Link href="/terms">Terms of sale</Link>
          {profile.is_seller && <><span className="h">Selling</span><Link href="/sell/dashboard">My vehicles for sale</Link></>}
          {profile.role === "admin" && <><span className="h">Tyrebiter</span><Link href="/admin">Admin</Link></>}
        </nav>
        <div style={{ display: "flex", flexDirection: "column", gap: 40, maxWidth: 860 }}>
          <h1 className="d2">Hi{profile.first_name ? `, ${profile.first_name}` : ""}.</h1>
          <div className="soft" style={{ padding: 28, background: miss.length ? "var(--sun)" : "var(--mint)" }}>
            <b style={{ fontSize: 22, letterSpacing: "-0.02em" }}>{miss.length ? `Finish ${miss.length} more step${miss.length === 1 ? "" : "s"} to start bidding.` : "You're ready to bid."}</b>
            <span>{miss.length ? "You can browse and build a watchlist now. Bidding and inspections need your details, a verified mobile, a payment card and a verified ID." : "Your details, mobile, card and ID are all verified."}</span>
            {profile.suspended && <span className="notice bad">Your account is suspended. Contact us to sort it out.</span>}
          </div>
          <div>
            <h2 className="d3" style={{ fontSize: 36, marginBottom: 8 }}>Verification.</h2>
            {row(1, "Account", true, user.email || "")}
            {row(2, "Your details", profile.details_done, profile.details_done ? `${profile.first_name} ${profile.last_name} · ${profile.suburb} ${profile.state} ${profile.postcode}` : "Legal name, date of birth and address")}
            {row(3, "Mobile", profile.mobile_verified, profile.mobile_verified ? `${maskMobile(profile.mobile)} verified` : "Verify with a 6-digit SMS code")}
            {row(4, "Payment card", !!profile.payment_method_id, profile.payment_method_id ? `${profile.card_brand} ending ${profile.card_last4}. Charged automatically if you win` : "Needed before you bid")}
            {row(5, "ID", profile.id_status === "verified", profile.id_status === "verified" ? "Verified" : profile.id_status === "pending" ? "Being checked" : profile.id_status === "failed" ? "Couldn't be verified. Try again" : "Driver licence or passport, checked once")}
          </div>

          <div id="invoices">
            <h2 className="d3" style={{ fontSize: 36, marginBottom: 16 }}>Invoices.</h2>
            {invoices?.length ? (
              <div className="ss" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
                {invoices.map((inv: { id: string; ref: string; status: string; total: number; created_at: string; lots: { title: string } | null }) => (
                  <Link key={inv.id} href={`/account/invoices/${inv.id}`} className="soft" style={{ background: "#FFFFFF", border: `2px solid ${INV_TAG[inv.status][0]}` }}>
                    <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{inv.ref}</b><span className="tag" style={{ background: INV_TAG[inv.status][0] }}>{INV_TAG[inv.status][1]}</span></span>
                    <span style={{ fontWeight: 700 }}>{inv.lots?.title}</span>
                    <span className="muted">{money(inv.total, true)} · {dateLong(inv.created_at)}</span>
                  </Link>
                ))}
              </div>
            ) : <p className="muted">No invoices yet. When you win or buy a vehicle, the invoice appears here.</p>}
          </div>

          <NotifySettings initial={profile.notify} />

          <AccountExtras company={profile.company_name || ""} abn={profile.abn || ""} email={user.email} />

          <div>
            <h2 className="d3" style={{ fontSize: 36, marginBottom: 12 }}>Selling.</h2>
            {appraisals?.length ? appraisals.map((a: { id: string; ref: string; rego: string; state: string; status: string; lot_id: number | null }) => {
              const idx = STEPS.findIndex((s) => s[0] === a.status);
              return (
                <div className="soft" key={a.id} style={{ gap: 4, marginBottom: 12 }}>
                  <b style={{ fontSize: 18 }}>{a.rego} ({a.state}) · {a.ref}</b>
                  {STEPS.map(([k, label], i) => (
                    <div className="check" key={k} style={{ border: 0, padding: "8px 0" }}><span className="tick" style={{ background: i <= idx ? "var(--mint)" : "#FFFFFF" }}>{i <= idx ? <Tick /> : <b style={{ fontSize: 13 }}>{i + 1}</b>}</span><span style={{ fontWeight: i <= idx ? 700 : 500 }}>{label}</span></div>
                  ))}
                  {a.lot_id && <Link className="more" style={{ fontSize: 16 }} href={`/lot/${a.lot_id}`}>View your listing ›</Link>}
                </div>
              );
            }) : <div className="soft"><span>You&apos;re not selling anything yet.</span><Link className="btn btn-dark" href="/sell" style={{ alignSelf: "flex-start", height: 46, fontSize: 15 }}>Get a free appraisal</Link></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
