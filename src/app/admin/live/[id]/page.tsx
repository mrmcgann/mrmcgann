import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LiveConsole } from "./LiveConsole";

export const dynamic = "force-dynamic";

// The auctioneer's console for one live sale. Every button is one database step (admin_live_*), logged in Admin → Security.
export default async function LiveConsolePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(); // checked on every page, not just the layout
  const { id } = await params;
  const { data: sale } = await supabaseAdmin().from("sales").select("id, slug, title, mode").eq("id", Number(id)).maybeSingle();
  if (!sale) notFound();
  if (sale.mode !== "live") {
    return (<><h1 className="d2">{sale.title}.</h1><p className="muted">This is a timed sale. Switch it to a live auction in <Link className="blue" href="/admin/sale-events">Sales</Link> first.</p></>);
  }
  return <LiveConsole saleId={sale.id} slug={sale.slug} title={sale.title} />;
}
