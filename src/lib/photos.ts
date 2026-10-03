import { env } from "@/lib/env";
// Photo paths are storage paths (lot-photos bucket), full URLs, or site paths ("/sample-photos/...").
export const photoUrl = (path: string) =>
  path.startsWith("http") || path.startsWith("/") ? path : `${env.supabaseUrl}/storage/v1/object/public/lot-photos/${path}`;
// Approved listing videos live in the public lot-videos bucket.
export const videoUrl = (path: string) =>
  path.startsWith("http") ? path : `${env.supabaseUrl}/storage/v1/object/public/lot-videos/${path}`;
