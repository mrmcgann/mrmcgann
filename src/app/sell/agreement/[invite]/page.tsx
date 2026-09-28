import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSettingsCached } from "@/lib/cache";
import { SELLER_AGREEMENT, fillLegal } from "@/content/legal";
import { money } from "@/lib/format";
import { env } from "@/lib/env";
import { AgreementForm } from "./AgreementForm";

export const metadata: Metadata = { title: "Your seller agreement", robots: { index: false } };
export const dynamic = "force-dynamic";

type Preview = { lot_id: number; title: string; status: string; suburb: string; state: string; vin: string | null; rego_plate: string | null; odometer: number | null; reserve_price: number | null; seller_id: string | null; signed: boolean };

export default async function SellerAgreementPage({ params }: { params: Promise<{ invite: string }> }) {
  const { invite } = await params;
  const { user, profile } = await getSession();
  const { data } = /^[0-9a-f]{32}$/.test(invite) ? await supabaseAdmin().rpc("invite_preview", { p_invite: invite }) : { data: null };
  const v = data as Preview | null;
  const here = `/sell/agreement/${invite}`;
  const settings = await getSettingsCached();
  const clauses = fillLegal(SELLER_AGREEMENT, settings);

  if (!v) return <Shell><div className="notice bad">This link isn&apos;t valid or has expired. Call us on {env.phone} and we&apos;ll send a new one.</div></Shell>;
  if (v.seller_id && v.seller_id !== user?.id) return <Shell><div className="notice bad">This listing is already linked to another account. If that&apos;s not right, call us on {env.phone}.</div></Shell>;
  if (v.signed && v.seller_id === user?.id) {
    return <Shell title={v.title}><div className="notice ok">You&apos;ve signed your agreement. We&apos;ll check your papers and let you know when the auction goes live.</div><Link className="btn btn-blue" href="/sell/dashboard">Go to your seller dashboard</Link></Shell>;
  }

  const steps: [boolean, string, string][] = user ? [
    [!!profile?.details_done, "Your details (legal name, date of birth, address)", `/join?step=2&seller=1&next=${encodeURIComponent(here)}`],
    [!!profile?.mobile_verified, "Verify your mobile", `/join?step=3&seller=1&next=${encodeURIComponent(here)}`],
    [profile?.id_status === "verified", "Verify your ID (licence or passport + selfie, in your browser)", `/join?step=5&seller=1&next=${encodeURIComponent(here)}`],
  ] : [];
  const ready = user && steps.every(([ok]) => ok);

  return (
    <Shell title={v.title}>
      <div className="soft">
        <b style={{ fontSize: 18 }}>{v.title}</b>
        <span className="muted">At {v.suburb}, {v.state}{v.vin ? ` · VIN ${v.vin}` : ""}{v.rego_plate ? ` · Rego ${v.rego_plate}` : ""}</span>
        {v.reserve_price != null && <span>Reserve we discussed: <b>{money(v.reserve_price)}</b> (you can change it below)</span>}
      </div>
      {!user ? (
        <div className="soft">
          <b>First, create your free account (or sign in).</b>
          <span className="muted">We verify every seller&apos;s identity, just like every bidder. It keeps scammers off Tyrebiter.</span>
          <div className="pill-row"><Link className="btn btn-blue" href={`/join?seller=1&next=${encodeURIComponent(here)}`}>Create account</Link><Link className="btn btn-soft" href={`/signin?next=${encodeURIComponent(here)}`}>Sign in</Link></div>
        </div>
      ) : !ready ? (
        <div className="soft">
          <b>Before you sign, three quick checks.</b>
          {steps.map(([ok, label, href]) => (
            <div className="check" key={label}><span className="tick" style={{ background: ok ? "var(--mint)" : "var(--panel2)" }}>{ok ? "✓" : ""}</span><span style={{ flex: 1 }}>{label}</span>{!ok && <Link className="btn btn-dark" style={{ height: 40, fontSize: 14 }} href={href}>Do it now</Link>}</div>
          ))}
        </div>
      ) : (
        <AgreementForm invite={invite} userId={user.id} reserve={v.reserve_price} legalName={`${profile?.first_name} ${profile?.last_name}`} clauses={clauses} />
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="wrap" style={{ maxWidth: 860, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 22 }}>
      <span className="eyebrow" style={{ color: "var(--grape)" }}>Selling with Tyrebiter{title ? ` · ${title}` : ""}</span>
      <h1 className="d2" style={{ fontSize: "clamp(38px,6vw,64px)" }}>Your seller agreement.</h1>
      <p className="lede" style={{ margin: 0 }}>Tell us about the vehicle honestly, confirm you own it, and tell us where to send the money. It takes about ten minutes.</p>
      {children}
    </div>
  );
}
