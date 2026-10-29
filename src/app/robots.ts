import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { absoluteUrl } from "@/lib/site";
import { isIndexableHost } from "@/lib/seo";

/**
 * robots.ts (Next genera /robots.txt a partir de esto).
 * D60: solo el host de NEXT_PUBLIC_SITE_URL (y nunca *.vercel.app) es
 * rastreable. En staging, reclu-prod.vercel.app y previews: Disallow total.
 */
export const ROBOTS_DISALLOW = [
  "/app/", "/login", "/signup", "/dashboard", "/dashboard/", "/settings/", "/alerts/", "/compare/",
  "/api/", "/auth/", "/admin/", "/upgrade/", "/mi-portafolio/", "/embed/", "/offline",
];

export function buildRobots(host: string | null): MetadataRoute.Robots {
  if (!isIndexableHost(host)) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ROBOTS_DISALLOW }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  return buildRobots(h.get("x-forwarded-host") ?? h.get("host"));
}