import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// One of the state's forms attached to an offer to sell a vehicle after the auction: the buyer it was made to (or
// staff) gets a short-lived link to the private file (a redirect, or with ?json=1 the link itself, for the app).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return new Response("Sign in first", { status: 401 });
  const { data: o } = await db.from("second_chance_offers").select("docs, kind").eq("id", id).maybeSingle(); // RLS: their own offers, or admin
  const docs = (o?.docs || []) as { name: string; path: string }[];
  const q = new URL(req.url).searchParams;
  const i = Number(q.get("i"));
  if (!o || o.kind !== "after_auction" || !Number.isInteger(i) || i < 0 || i >= docs.length) return new Response("Not found", { status: 404 });
  const { data, error } = await supabaseAdmin().storage.from("after-sale-docs").createSignedUrl(docs[i].path, 300);
  if (error || !data?.signedUrl) return new Response("Not found", { status: 404 });
  const headers = { "Cache-Control": "private, no-store" };
  if (q.get("json") === "1") return Response.json({ url: data.signedUrl, name: docs[i].name }, { headers });
  return new Response(null, { status: 302, headers: { ...headers, Location: data.signedUrl } });
}
