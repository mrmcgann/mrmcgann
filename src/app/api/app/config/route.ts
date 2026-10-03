import { getFeesCached, getSettingsCached } from "@/lib/cache";
import { env, has } from "@/lib/env";

// Settings the app reads at start-up. "minVersion" (settings key "app") lets us ask
// people on a very old build to update, e.g. after a change to the terms or the API:
//   update settings set value = '{"min_ios":"1.2.0","min_android":"1.2.0"}' where key = 'app';
export async function GET() {
  const [fees, settings] = await Promise.all([getFeesCached(), getSettingsCached()]);
  const app = (settings.app || {}) as { min_ios?: string; min_android?: string; notice?: string };
  return Response.json({
    fees,
    minVersion: { ios: app.min_ios || "1.0.0", android: app.min_android || "1.0.0" },
    notice: app.notice || null,
    siteUrl: env.siteUrl,
    phone: env.phone,
    supportEmail: env.supportEmail,
    legalName: env.legalName,
    abn: env.abn,
    testMode: env.testMode,
    stripe: has.stripe && Boolean(env.stripePublishable),
    sms: has.twilioVerify,
    stores: { ios: process.env.NEXT_PUBLIC_APP_STORE_URL || null, android: process.env.NEXT_PUBLIC_PLAY_STORE_URL || null },
  }, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600", "CDN-Cache-Control": "public, s-maxage=300" },
  });
}
