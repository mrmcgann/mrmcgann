import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";

export const dynamic = "force-dynamic";

type Admin = { id: string; name: string; email: string | null; two_step: boolean; last_sign_in: string | null };
type Entry = { id: number; at: string; actor_email: string | null; action: string; target: string | null; detail: Record<string, unknown>; outcome: string | null; ip: string | null };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Never");
const fields = (d: Record<string, unknown>) => (Array.isArray(d.fields) && d.fields.length ? `Changed: ${(d.fields as string[]).join(", ")}` : "");

// Admin → Security: who has admin access, whether each has two-step sign-in, and the log of everything admins did.
// The log can only grow: nobody, staff included, can edit or delete it.
export default async function Security() {
  await requireAdmin();
  const db = supabaseAdmin();
  const [{ data: sec }, { data: log }] = await Promise.all([
    db.rpc("admin_security"),
    db.from("admin_audit").select("id, at, actor_email, action, target, detail, outcome, ip").order("at", { ascending: false }).limit(200),
  ]);
  const s = (sec || { mfa_required: true, admins: [] }) as { mfa_required: boolean; admins: Admin[] };
  const missing = s.admins.filter((a) => !a.two_step).length;
  return (
    <>
      <h1 className="d2">Security.</h1>
      <p className="lede" style={{ margin: 0, fontSize: 18 }}>Who can get into Admin, and a record of everything done here. Admin accounts can see members&apos; details and move money, so each one needs a code from an authenticator app as well as a password.</p>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="sec-mfa">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Two-step sign-in for admins</h2>
        {s.mfa_required ? (
          <>
            <span><span className="sev good"><i aria-hidden="true" />On</span> Every admin enters a code from their phone each time they sign in. A stolen password alone can&apos;t get into Admin, and the database refuses admin changes without it.</span>
            <span><AdminAction action="settings" payload={{ key: "security", value: { admin_mfa: false } }} label="Turn off" tone="bad" confirmText="Turn off two-step for admins? A stolen password would then be enough to get into Admin." /></span>
          </>
        ) : (
          <>
            <span><span className="sev act"><i aria-hidden="true" />Off</span> Admins get in with a password alone. Turn it on: it&apos;s the single best protection for the site.</span>
            <span><AdminAction action="settings" payload={{ key: "security", value: { admin_mfa: true } }} label="Turn on" tone="blue" /></span>
          </>
        )}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12, overflowX: "auto" }} data-testid="sec-admins">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>People with admin access ({s.admins.length})</h2>
        <span className="muted" style={{ fontSize: 15 }}>Every admin is told straight away when someone is given admin access. Remove anyone who shouldn&apos;t be here in Members.{missing ? ` ${missing} haven't set up two-step yet: they'll be asked the next time they open Admin.` : ""}</span>
        <table className="table"><thead><tr><th>Name</th><th>Email</th><th>Two-step</th><th>Last signed in</th></tr></thead>
          <tbody>{s.admins.map((a) => (
            <tr key={a.id}><td><b>{a.name || "No name yet"}</b></td><td>{a.email}</td>
              <td>{a.two_step ? <span className="sev good"><i aria-hidden="true" />Set up</span> : <span className="sev act"><i aria-hidden="true" />Not yet</span>}</td>
              <td style={{ whiteSpace: "nowrap" }}>{when(a.last_sign_in)}</td></tr>
          ))}</tbody></table>
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12, overflowX: "auto" }} data-testid="sec-log">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Admin log</h2>
        <span className="muted" style={{ fontSize: 15 }}>The latest 200 things admins did, newest first. Bank details, codes and passwords are never written here.</span>
        {(log as Entry[] | null)?.length ? (
          <table className="table"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Result</th><th>Network</th></tr></thead>
            <tbody>{(log as Entry[]).map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: "nowrap" }}>{when(e.at)}</td>
                <td>{e.actor_email || "Site"}</td>
                <td><b>{e.action}</b>{e.target ? <><br /><span className="muted" style={{ fontSize: 13 }}>{e.target}</span></> : null}{fields(e.detail) ? <><br /><span className="muted" style={{ fontSize: 13 }}>{fields(e.detail)}</span></> : null}</td>
                <td>{e.outcome === "ok" ? "Done" : e.outcome || ""}</td>
                <td style={{ fontSize: 13 }}>{e.ip || ""}</td>
              </tr>
            ))}</tbody></table>
        ) : <span className="muted">Nothing yet.</span>}
      </div>
    </>
  );
}
