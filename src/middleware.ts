import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/account", "/watchlist", "/admin", "/sell/dashboard"];

// Keeps the Supabase session fresh and guards signed-in areas.
// Visitors who aren't signed in pass straight through with no work at all,
// and signed-in visitors are checked locally (no auth-server call per page).
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const needsAuth = PROTECTED.some((p) => path.startsWith(p));
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));

  const toSignin = () => {
    const to = request.nextUrl.clone();
    to.pathname = "/signin";
    to.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(to);
  };

  if (!hasSession) return needsAuth ? toSignin() : NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  if (needsAuth && !data?.claims) return toSignin();
  return response;
}

export const config = {
  // Pages only. API routes check the session themselves; static files skip it.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)"],
};
