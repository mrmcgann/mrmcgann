import { NextResponse } from "next/server";

// Tells iOS which website links open in the Tyrebiter app, and lets iPhone passwords fill in the app.
// Needs APPLE_TEAM_ID (developer.apple.com > Membership). Until it's set this returns 404, so Apple doesn't cache a bad file.
export const dynamic = "force-dynamic";

const BUNDLE_ID = "au.com.tyrebiter.app";
// Keep in step with APP_PATHS in mobile/app.config.ts.
const PATHS = ["/lot/*", "/auctions", "/auctions/*", "/watchlist", "/account", "/account/*", "/sell/dashboard", "/sell/dashboard/*", "/handover/*", "/join", "/signin"];

export function GET() {
  const team = (process.env.APPLE_TEAM_ID || "").trim();
  if (!/^[A-Z0-9]{10}$/.test(team)) return new NextResponse("Not configured", { status: 404 });
  const app = `${team}.${BUNDLE_ID}`;
  const body = {
    applinks: { details: [{ appIDs: [app], components: PATHS.map((p) => ({ "/": p })) }] },
    webcredentials: { apps: [app] },
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
