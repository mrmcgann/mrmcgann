import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Handles email confirmation and password-reset links.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/account";
  if (code) {
    const db = await supabaseServer();
    await db.auth.exchangeCodeForSession(code);
    const { data: { user } } = await db.auth.getUser();
    if (user && next === "/join") await db.from("profiles").update({ terms_accepted_at: new Date().toISOString() }).eq("id", user.id);
  }
  return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/account", url.origin));
}
