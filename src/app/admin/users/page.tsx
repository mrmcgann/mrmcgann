import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { maskMobile, dateTime, money } from "@/lib/format";

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin(); // checked on every page, not just the layout
  const { q = "" } = await searchParams;
  let query = supabaseAdmin().from("profiles").select("*").order("created_at", { ascending: false }).limit(200);
  const safe = q.replace(/[^\p{L}\p{N}@.+' -]/gu, "").trim();
  if (safe) query = query.or(`email.ilike.%${safe}%,last_name.ilike.%${safe}%,mobile.ilike.%${safe}%,deposit_ref.eq.${safe.toUpperCase().replace(/[^A-Z0-9]/g, "")}`);
  const { data } = await query;
  // each member's bidding deposit (the ledger's sum)
  const ids = (data || []).map((p) => p.id);
  const { data: dep } = ids.length ? await supabaseAdmin().from("bidder_deposits").select("user_id, amount").in("user_id", ids).neq("status", "cancelled") : { data: [] };
  const { data: bans } = ids.length ? await supabaseAdmin().from("banned_identities").select("user_id").in("user_id", ids) : { data: [] };
  const banned = new Set((bans || []).map((x: { user_id: string }) => x.user_id));
  const bal = new Map<string, number>();
  for (const r of dep || []) bal.set(r.user_id, (bal.get(r.user_id) || 0) + Number(r.amount));
  return (
    <>
      <h1 className="d2">Members.</h1>
      <form action="/admin/users" className="pill-row"><input className="input" name="q" defaultValue={q} placeholder="Email, surname, mobile or BID reference" style={{ width: 320 }} /><button className="btn btn-dark" style={{ height: 54 }}>Search</button></form>
      <div className="admin-card" style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>Member</th><th>Verification</th><th>Deposit</th><th>Joined</th><th /></tr></thead>
          <tbody>{(data || []).map((p) => (
            <tr key={p.id}>
              <td><b>{p.first_name} {p.last_name}</b>{p.role === "admin" && <span className="tag" style={{ background: "var(--sky)", height: 22, marginLeft: 6 }}>Admin</span>}{p.suspended && <span className="tag" style={{ background: "var(--berry)", height: 22, marginLeft: 6 }}>{banned.has(p.id) ? "Banned" : "Suspended"}</span>}{p.suspended && p.suspended_reason && <><br /><span className="errmsg" style={{ fontSize: 13 }}>{p.suspended_reason}</span></>}<br /><span className="muted">{p.email}<br />{maskMobile(p.mobile)} · {p.suburb} {p.state}</span></td>
              <td>Details {p.details_done ? "✓" : "–"} · Mobile {p.mobile_verified ? "✓" : "–"} · {p.card_last4 ? `Card ${p.card_brand} ${p.card_last4} · ` : ""}ID {p.id_status}</td>
              <td><b>{money(bal.get(p.id) || 0)}</b><br /><span className="muted">{p.deposit_ref}</span></td>
              <td>{dateTime(p.created_at)}</td>
              <td><span className="pill-row">
                {!p.suspended && <AdminAction action="ban" payload={{ userId: p.id }} label="Ban" input={{ name: "reason", placeholder: "Why (they see it)" }} tone="bad" />}
                <AdminAction action="member" payload={{ userId: p.id, suspended: !p.suspended }} label={p.suspended ? "Unsuspend" : "Suspend"} confirmText={p.suspended ? "Restore bidding (and lift any ban)?" : "Stop this member bidding for now?"} tone={p.suspended ? "soft" : "bad"} />
                {p.id_status !== "verified" && <AdminAction action="member" payload={{ userId: p.id, idStatus: "verified" }} label="Mark ID verified" confirmText="You've checked their ID in person?" tone="soft" />}
                <AdminAction action="member" payload={{ userId: p.id, role: p.role === "admin" ? "buyer" : "admin" }} label={p.role === "admin" ? "Remove admin" : "Make admin"} confirmText="Change admin access?" tone="soft" />
              </span></td>
            </tr>
          ))}</tbody></table>
      </div>
    </>
  );
}
