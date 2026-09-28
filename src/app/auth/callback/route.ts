import { currentUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { acceptCurrentTerms } from "@/lib/terms";

// Handles email confirmation and password-reset links.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/account";
  if (code) {
    const db = await supabaseServer();
    await db.auth.exchangeCodeForSession(code);
    const user = await currentUser(db);
    if (user && next === "/join") await acceptCurrentTerms(user.id);
  }
  return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/account", url.origin));
}
