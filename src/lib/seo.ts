import type { Metadata } from "next";
import { absoluteUrl, siteHost, siteUrl } from "@/lib/site";

/**
 * D60: SEO centralizado. Canonical, Open Graph y Twitter por página, reglas
 * de indexación por host y esquemas JSON-LD reutilizables.
 */

export const SITE_NAME = "fraccion.si";

/**
 * Solo se indexa el host de NEXT_PUBLIC_SITE_URL, y nunca un *.vercel.app
 * (staging, reclu-prod.vercel.app y previews) ni localhost.
 */
export function isIndexableHost(host: string | null | undefined, canonicalHost = siteHost()): boolean {
  if (!host) return false;
  // Solo producción indexa: en previews y prueba (VERCEL_ENV distinto de
  // "production") robots.txt sigue con Disallow total.
  const vercelEnv = (process.env.VERCEL_ENV ?? "").trim();
  if (vercelEnv && vercelEnv !== "production") return false;
  const h = host.toLowerCase().split(":")[0];
  const c = canonicalHost.toLowerCase().split(":")[0];
  if (h !== c) return false;
  if (h.endsWith(".vercel.app") || h === "localhost" || h === "127.0.0.1") return false;
  return true;
}

type PageSeoInput = Metadata;

/**
 * Agrega canonical, openGraph y twitter propios a la metadata de una página.
 * Lo que la página ya define (alternates, openGraph, robots…) se respeta.
 */
export function withSeo(path: string, meta: PageSeoInput): Metadata {
  const title =
    typeof meta.title === "string"
      ? meta.title
      : meta.title && typeof meta.title === "object" && "absolute" in meta.title
        ? meta.title.absolute
        : undefined;
  const description = meta.description ?? undefined;
  const { alternates, openGraph, twitter } = meta;
  const url = absoluteUrl(path);
  return {
    ...meta,
    alternates: {
      canonical: path,
      languages: { "es-CL": path, "x-default": path },
      ...(alternates ?? {}),
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "es_CL",
      type: "website",
      ...(openGraph ?? {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(twitter ?? {}),
    },
  };
}

export function organizationSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl()}/#organization`,
    name: SITE_NAME,
    url: siteUrl(),
    logo: absoluteUrl("/icons/icon-512.png"),
  };
}

export function websiteSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl()}/#website`,
    name: SITE_NAME,
    url: siteUrl(),
    inLanguage: "es-CL",
    publisher: { "@id": `${siteUrl()}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl("/explore")}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function itemListSchema(
  name: string,
  items: { name: string; url?: string }[],
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      ...(item.url ? { url: item.url } : {}),
    })),
  };
}

export function faqSchema(items: { q: string; a: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}