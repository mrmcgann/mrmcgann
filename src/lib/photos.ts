import { env } from "@/lib/env";
export const photoUrl = (path: string) =>
  path.startsWith("http") ? path : `${env.supabaseUrl}/storage/v1/object/public/lot-photos/${path}`;
