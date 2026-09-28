import "server-only";
import { env } from "@/lib/env";

// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>".
export function authorised(req: Request) {
  const auth = req.headers.get("authorization");
  const qs = new URL(req.url).searchParams.get("secret");
  return !!env.cronSecret && (auth === `Bearer ${env.cronSecret}` || qs === env.cronSecret);
}
