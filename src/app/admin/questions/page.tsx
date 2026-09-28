import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { dateTime } from "@/lib/format";

export default async function Questions({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "open" } = await searchParams;
  let q = supabaseAdmin().from("lot_questions").select("*, lots(id, title, status), profiles(first_name, last_name)").order("created_at", { ascending: status === "open" }).limit(200);
  if (status !== "all") q = q.eq("status", status);
  const { data } = await q;
  return (
    <>
      <h1 className="d2">Questions.</h1>
      <p className="muted">Check with the seller, then answer. Tick “publish” for answers that help every buyer (they appear on the listing). Never pass on contact details.</p>
      <div className="pill-row">{["open", "answered", "hidden", "all"].map((s) => <Link key={s} className="pill pill-soft" href={`/admin/questions?status=${s}`} style={status === s ? { background: "var(--ink)", color: "#FFFFFF" } : undefined}>{s}</Link>)}</div>
      <div className="admin-card" style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>Vehicle</th><th>Question</th><th>Answer</th><th /></tr></thead>
          <tbody>{(data || []).map((x) => {
            const lot = (Array.isArray(x.lots) ? x.lots[0] : x.lots) as { id: number; title: string; status: string } | null;
            const who = (Array.isArray(x.profiles) ? x.profiles[0] : x.profiles) as { first_name: string; last_name: string } | null;
            return (
              <tr key={x.id}>
                <td><Link href={`/lot/${lot?.id}`} style={{ fontWeight: 700 }}>{lot?.title}</Link><br /><span className="muted">{lot?.status}</span></td>
                <td>{x.question}<br /><span className="muted">{who?.first_name} {who?.last_name?.slice(0, 1)}. · {dateTime(x.created_at)}</span></td>
                <td>{x.answer || <span className="muted">Not yet</span>}{x.public && <><br /><span className="status-pill">public</span></>}</td>
                <td><span className="pill-row">
                  {x.status !== "hidden" && <AdminAction action="answer-question" payload={{ questionId: x.id, public: true }} label="Answer + publish" input={{ name: "answer", placeholder: "Answer" }} tone="blue" />}
                  {x.status !== "hidden" && <AdminAction action="answer-question" payload={{ questionId: x.id, public: false }} label="Answer privately" input={{ name: "answer", placeholder: "Answer" }} tone="soft" />}
                  {x.status !== "hidden" && <AdminAction action="hide-question" payload={{ questionId: x.id }} label="Hide" confirmText="Hide this question?" tone="bad" />}
                </span></td>
              </tr>
            );
          })}</tbody></table>
      </div>
    </>
  );
}
