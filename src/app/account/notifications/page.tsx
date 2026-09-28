import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { MarkRead } from "./MarkRead";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function Notifications() {
  const { supabase, user } = await getSession();
  if (!user) redirect("/signin?next=/account/notifications");
  const { data } = await supabase.from("notifications").select("id, kind, title, body, link, read_at, created_at, channels").eq("user_id", user.id).order("created_at", { ascending: false }).limit(60);
  return (
    <div className="wrap" style={{ maxWidth: 820, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 18 }}>
      <MarkRead />
      <h1 className="d2">Notifications.</h1>
      <p className="muted">Everything we&apos;ve sent you, in one place. <Link className="blue" href="/account#notifications">Change what we send ›</Link></p>
      {(data || []).length === 0 && <div className="empty"><span className="muted">Nothing yet. Outbid alerts, wins, payments and collection updates will appear here.</span></div>}
      {(data || []).map((n) => (
        <div key={n.id} className="soft" style={{ background: n.read_at ? "var(--panel)" : "#FFFFFF", border: n.read_at ? "0" : "1px solid var(--line)", gap: 6 }}>
          <span style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><b>{n.title}</b><span className="muted" style={{ fontSize: 13 }}>{dateTime(n.created_at)}</span></span>
          {n.body && <span className="muted" style={{ whiteSpace: "pre-wrap" }}>{n.body}</span>}
          {n.link && <Link className="blue" href={n.link} style={{ fontWeight: 700 }}>Open ›</Link>}
        </div>
      ))}
    </div>
  );
}
