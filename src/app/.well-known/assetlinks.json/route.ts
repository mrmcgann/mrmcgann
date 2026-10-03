import { NextResponse } from "next/server";

// Tells Android which website links open in the Tyrebiter app, and shares saved passwords with it.
// Needs ANDROID_CERT_SHA256: the SHA-256 fingerprints from Play Console > App integrity > App signing
// (the app signing key and the upload key), comma separated. Until it's set this returns 404.
export const dynamic = "force-dynamic";

const PACKAGE = "au.com.tyrebiter.app";

export function GET() {
  const prints = (process.env.ANDROID_CERT_SHA256 || "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  if (!prints.length) return new NextResponse("Not configured", { status: 404 });
  const body = [{
    relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
    target: { namespace: "android_app", package_name: PACKAGE, sha256_cert_fingerprints: prints },
  }];
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
