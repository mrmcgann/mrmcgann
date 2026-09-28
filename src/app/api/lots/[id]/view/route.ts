import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { allow, clientIp } from "@/lib/ratelimit";

// Counts a view once per visitor per vehicle per day.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lot = Number(id);
  const store = await cookies();
  const seen = (store.get("tb_seen")?.value || "").split(".").filter(Boolean);
  if (!lot || seen.includes(String(lot))) return new Response(null, { status: 204 });
  if (!(await allow(`view:${await clientIp()}`, 120, 3600))) return new Response(null, { status: 204 });
  await supabaseAdmin().rpc("bump_view", { p_lot: lot });
  store.set("tb_seen", [...seen, String(lot)].slice(-200).join("."), { maxAge: 86400, httpOnly: true, sameSite: "lax", path: "/" });
  return new Response(null, { status: 204 });
}
