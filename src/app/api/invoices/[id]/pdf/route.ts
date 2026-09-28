import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { invoicePdf } from "@/lib/pdf";

// Download the tax invoice (the buyer, or an admin).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return new Response("Sign in first", { status: 401 });
  const { data: inv } = await db.from("invoices").select("id").eq("id", id).maybeSingle(); // RLS: own invoices, or admin
  if (!inv) return new Response("Not found", { status: 404 });
  const pdf = await invoicePdf(id);
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(pdf.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.filename}"`, "Cache-Control": "private, no-store" } });
}
