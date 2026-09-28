import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { userFromToken } from "@/lib/links";
import { NotifySettings } from "@/components/NotifySettings";

export const metadata: Metadata = { title: "Manage alerts", robots: { index: false } };
export const dynamic = "force-dynamic";

// Opened from the link in any alert email or SMS. No sign-in needed.
export default async function ManageAlerts({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = userFromToken(token);
  const { data: p } = userId ? await supabaseAdmin().from("profiles").select("email, notify").eq("id", userId).maybeSingle() : { data: null };
  return (
    <div className="wrap" style={{ maxWidth: 720, padding: "clamp(40px,6vw,72px) 16px" }}>
      {!p ? <div className="notice bad">This link isn&apos;t valid. Sign in and use Account → Notifications instead.</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <h1 className="d2">Your alerts.</h1>
          <p className="muted">For {p.email}. Changes save as you tap.</p>
          <form action={`/api/unsubscribe?t=${encodeURIComponent(token)}`} method="post">
            <button className="btn btn-dark">Unsubscribe from all optional alerts</button>
          </form>
          <NotifySettings initial={p.notify} token={token} />
        </div>
      )}
    </div>
  );
}
