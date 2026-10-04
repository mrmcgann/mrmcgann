import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { saleCertificatePdf } from "@/lib/pdf";

// Certificate of sale: Tyrebiter, as agent for the owner, sold this vehicle to the buyer.
// The buyer's proof of ownership (and what an unregistered vehicle's new owner keeps).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return new Response("Sign in first", { status: 401 });
  const { data: inv } = await db.from("invoices").select("id, status").eq("id", id).maybeSingle(); // RLS: own invoices, or admin
  if (!inv) return new Response("Not found", { status: 404 });
  if (inv.status !== "paid") return new Response("Available once the invoice is paid in full", { status: 409 });
  const pdf = await saleCertificatePdf(id);
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(pdf.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"`, "Cache-Control": "private, no-store" } });
}
