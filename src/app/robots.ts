import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/api/", "/u/", "/handover/", "/sell/agreement/", "/sell/dashboard"] }],
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
