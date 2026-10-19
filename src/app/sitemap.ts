import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://reclu.cl";
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/explore`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/terminos`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/privacidad`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/disclaimer`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    // Tickers más comunes (páginas por acción, F7) — el resto se descubre
    // vía enlaces internos y canonical.
    ...[
      "nvda", "aapl", "msft", "tsla", "amzn", "googl",
      "meta", "pltr", "sqm-b", "copec", "xom", "ba",
    ].map((symbol) => ({
      url: `${base}/accion/${symbol}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
