import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { dateTime } from "@/lib/format";

export default async function Messages() {
  const { data } = await supabaseAdmin().from("contact_messages").select("*").order("created_at", { ascending: false }).limit(200);
  return (
    <>
      <h1 className="d2">Contact messages.</h1>
      <div className="admin-card" style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>From</th><th>Message</th><th /></tr></thead>
          <tbody>{(data || []).map((m) => (
            <tr key={m.id}>
              <td><b>{m.name}</b><br /><a className="blue" href={`mailto:${m.email}`}>{m.email}</a><br /><span className="muted">{m.topic} · {dateTime(m.created_at)}</span></td>
              <td style={{ whiteSpace: "pre-wrap" }}>{m.message}</td>
              <td>{m.status === "new" ? <AdminAction action="contact-done" payload={{ id: m.id }} label="Done" tone="soft" /> : <span className="muted">Done</span>}</td>
            </tr>
          ))}</tbody></table>
      </div>
    </>
  );
}
