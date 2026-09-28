import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { maskMobile, dateTime } from "@/lib/format";

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  let query = supabaseAdmin().from("profiles").select("*").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`email.ilike.%${q}%,last_name.ilike.%${q}%,mobile.ilike.%${q}%`);
  const { data } = await query;
  return (
    <>
      <h1 className="d2">Members.</h1>
      <form action="/admin/users" className="pill-row"><input className="input" name="q" defaultValue={q} placeholder="Email, surname or mobile" style={{ width: 320 }} /><button className="btn btn-dark" style={{ height: 54 }}>Search</button></form>
      <div className="admin-card" style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>Member</th><th>Verification</th><th>Joined</th><th /></tr></thead>
          <tbody>{(data || []).map((p) => (
            <tr key={p.id}>
              <td><b>{p.first_name} {p.last_name}</b>{p.role === "admin" && <span className="tag" style={{ background: "var(--sky)", height: 22, marginLeft: 6 }}>Admin</span>}{p.suspended && <span className="tag" style={{ background: "var(--berry)", height: 22, marginLeft: 6 }}>Suspended</span>}<br /><span className="muted">{p.email}<br />{maskMobile(p.mobile)} · {p.suburb} {p.state}</span></td>
              <td>Details {p.details_done ? "✓" : "–"} · Mobile {p.mobile_verified ? "✓" : "–"} · Card {p.card_last4 ? `${p.card_brand} ${p.card_last4}` : "–"} · ID {p.id_status}</td>
              <td>{dateTime(p.created_at)}</td>
              <td><span className="pill-row">
                <AdminAction action="member" payload={{ userId: p.id, suspended: !p.suspended }} label={p.suspended ? "Unsuspend" : "Suspend"} confirmText={p.suspended ? "Restore bidding?" : "Stop this member bidding?"} tone={p.suspended ? "soft" : "bad"} />
                {p.id_status !== "verified" && <AdminAction action="member" payload={{ userId: p.id, idStatus: "verified" }} label="Mark ID verified" confirmText="You've checked their ID in person?" tone="soft" />}
                <AdminAction action="member" payload={{ userId: p.id, role: p.role === "admin" ? "buyer" : "admin" }} label={p.role === "admin" ? "Remove admin" : "Make admin"} confirmText="Change admin access?" tone="soft" />
              </span></td>
            </tr>
          ))}</tbody></table>
      </div>
    </>
  );
}
