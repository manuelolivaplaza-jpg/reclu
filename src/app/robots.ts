import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/**
 * robots.ts (Next genera /robots.txt a partir de esto).
 * Rutas privadas o sin valor SEO quedan excluidas; todo el catálogo
 * público (home, explore, portfolio/*) es rastreable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/settings/", "/alerts/", "/compare/", "/api/", "/auth/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
