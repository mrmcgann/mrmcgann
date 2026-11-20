import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { appointmentPdf } from "@/lib/pdf";

// The seller's appointment of us (Form 9) as a PDF: the seller's own (row-level security), or any for staff. Once we've
// countersigned it's the signed copy; before that it says it's waiting for our signature.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return new Response("Sign in first", { status: 401 });
  const { data: ag } = await db.from("seller_agreements").select("id").eq("id", id).maybeSingle(); // RLS: the seller's own, or staff
  if (!ag) return new Response("Not found", { status: 404 });
  const pdf = await appointmentPdf(id);
  if (!pdf) return new Response("This agreement was signed before appointments were on Form 9. Call us and we'll send you a new one to sign.", { status: 404 });
  return new Response(Buffer.from(pdf.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"`, "Cache-Control": "private, no-store" } });
}
