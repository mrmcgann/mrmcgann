import { indexNowKey } from "@/lib/seoEngine";

// Proves to IndexNow (Bing and others) that our pings come from the site owner.
export function GET() {
  return new Response(indexNowKey(), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
