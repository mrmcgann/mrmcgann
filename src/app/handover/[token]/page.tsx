import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { rulesFor } from "@/lib/transfer";
import { HandoverForm } from "./HandoverForm";

export const metadata: Metadata = { title: "Hand over the vehicle", robots: { index: false } };
export const dynamic = "force-dynamic";

// The depot's private handover page (the link goes to the depot by email and SMS when a collection is confirmed).
export default async function Handover({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = supabaseAdmin();
  const { data: c } = /^[0-9a-f]{32}$/.test(token)
    ? await db.from("collections").select("status, confirmed_for, collector_name, buyer_id, lot_id, invoice_id, collected_at, lots(title, keys, rego_state, state)").eq("seller_token", token).maybeSingle()
    : { data: null };
  if (!c) return <div className="wrap" style={{ maxWidth: 640, padding: "60px 16px" }}><div className="notice bad">This handover link isn&apos;t valid. Call us on {env.phone}.</div></div>;
  const { data: b } = await db.from("profiles").select("first_name, last_name").eq("id", c.buyer_id).single();
  const lot = c.lots as unknown as { title: string; keys: number | null; rego_state: string | null; state: string | null };
  const who = c.collector_name || `${b?.first_name || ""} ${b?.last_name || ""}`.trim();
  // Whether this one is leaving without plates decides what the person at the gate has to establish. Letting an
  // unregistered vehicle be driven onto a road is an offence we commit too, as the party permitting it
  // (migration 33), so the depot is told before they read anything else on the page.
  const { data: unreg } = await db.rpc("leaves_unregistered", { p_invoice: c.invoice_id });
  const u = ((unreg || []) as { unregistered: boolean; permit_possible: boolean }[])[0];
  const noPlates = u?.unregistered === true;
  // A written-off vehicle can hold no permit at all, so for those the only honest answer is a truck or a trailer.
  const canPermit = noPlates && u?.permit_possible === true;
  // Manheim's model, which is the sensible one: don't turn a buyer away, hand them the permit. Most states issue
  // one online in minutes, so the depot can stand there while they do it.
  const permits = rulesFor(lot?.rego_state || lot?.state);
  return (
    <div className="wrap" style={{ maxWidth: 640, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 20 }}>
      <span className="eyebrow">Handover · {lot?.title}</span>
      <h1 className="d2" style={{ fontSize: "clamp(36px,6vw,56px)" }}>Handing over the keys.</h1>
      {c.status === "collected" ? <div className="notice ok">Handover confirmed. Thank you.</div>
        : c.status !== "confirmed" ? <div className="notice">This collection isn&apos;t confirmed yet. We&apos;ll text you when it is.</div> : (
        <>
          {noPlates && (
            <div className="notice bad" role="alert" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <b style={{ fontSize: 18 }}>This vehicle is UNREGISTERED. It has no plates.</b>
              {canPermit ? (
                <>
                  <span>It must not be driven on a road &mdash; not by the buyer, not by you, not across the
                  street. It leaves on a carrier, on a trailer, or driven only under a current unregistered
                  vehicle permit that you have seen with your own eyes.</span>
                  <span>No permit? <b>Don&apos;t hand over the keys</b> &mdash; but don&apos;t send them away
                  either. Most states issue one online in a few minutes:{" "}
                  <a className="blue" href={permits.permitUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontWeight: 700 }}>{permits.permit} with {permits.authority} ›</a>{" "}
                  Let them do it on their phone while they&apos;re standing there, then write the number down below.</span>
                </>
              ) : (
                <>
                  <span>This one is <b>written off</b>, so no permit can be issued for it and it can never be
                  driven on a road. It leaves on a carrier or a trailer, and there is no third option.</span>
                  <span>If they turn up expecting to drive it away, <b>don&apos;t hand over the keys</b>.
                  Call {env.phone}.</span>
                </>
              )}
            </div>
          )}
          <div className="soft">
            <span>Collection time: <b>{c.confirmed_for}</b></span>
            <span>Collected by: <b>{who}</b></span>
            <ol className="steps-mini">
              <li>Check their photo ID matches <b>{who}</b>.</li>
              <li>Ask them for the 6-digit release code. Don&apos;t hand over the keys without it, and never accept cash or a transfer from them. The buyer has already paid Tyrebiter.</li>
              <li>Let them check the vehicle against the listing before they take it. Viewing only: no test drives before handover.</li>
              {noPlates && <li><b>Unregistered:</b> see how it&apos;s going. {canPermit ? "If they're driving it, ask for the permit and write its number down below." : "It's written off, so it can only go on a truck or a trailer."}</li>}
              <li>Enter the code, the odometer and the keys handed over below.</li>
            </ol>
          </div>
          <HandoverForm token={token} keys={lot?.keys || null} who={who} noPlates={noPlates} canPermit={canPermit} />
        </>
      )}
      <p className="hint">Something wrong? Don&apos;t hand over the vehicle. Call {env.phone}.</p>
    </div>
  );
}
