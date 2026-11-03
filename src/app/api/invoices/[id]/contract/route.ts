import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { buyerContractPdf } from "@/lib/pdf";

// The winning bidder's sale contract: the record of the contract made at the fall of the hammer, with the statement
// and notices the vehicle's own state requires (docs/legal-basis.md section 12). Available as soon as the invoice
// exists, which is the point of it: the buyer should be able to read what they bought straight away, not after
// paying. A vehicle sold after the auction has its own signed contract at /api/offers/[id]/contract instead.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return new Response("Sign in first", { status: 401 });
  const { data: inv } = await db.from("invoices").select("id, sold_via").eq("id", id).maybeSingle(); // RLS: own invoices, or admin
  if (!inv) return new Response("Not found", { status: 404 });
  if (inv.sold_via === "after_auction") return new Response("This sale has its own signed contract", { status: 409 });
  const pdf = await buyerContractPdf(id);
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(pdf.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"`, "Cache-Control": "private, no-store" } });
}
