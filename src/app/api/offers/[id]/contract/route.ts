import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { afterSaleContractPdf } from "@/lib/pdf";

// The written contract for a sale after the auction: before the buyer signs (to read), and after (the signed copy).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return new Response("Sign in first", { status: 401 });
  const { data: o } = await db.from("second_chance_offers").select("id, kind").eq("id", id).maybeSingle(); // RLS: their own offers, or admin
  if (!o || o.kind !== "after_auction") return new Response("Not found", { status: 404 });
  const pdf = await afterSaleContractPdf(id);
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(pdf.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"`, "Cache-Control": "private, no-store" } });
}
