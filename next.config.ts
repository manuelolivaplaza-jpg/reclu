import type { NextConfig } from "next";

/**
 * Content Security Policy.
 * Note: Next.js requires 'unsafe-inline' for styles (styled-jsx / inline
 * styles). Plausible (analítica sin cookies) va en script-src/connect-src;
 * si se define NEXT_PUBLIC_PLAUSIBLE_DOMAIN se carga script.tagged-events.
 */
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? "";

const ContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'" +
    (PLAUSIBLE_DOMAIN ? " https://plausible.io" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Supabase (auth + API), Resend (emails), OpenRouter (AI), Vercel (live)
  // + Plausible (eventos de analítica, solo si hay dominio configurado)
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com https://openrouter.ai https://vercel.live" +
    (PLAUSIBLE_DOMAIN ? " https://plausible.io" : ""),
  // PWA: service worker propio (public/sw.js)
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: ContentSecurityPolicy,
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

// F5: gráficos incrustables para medios/creadores. Solo /embed/* puede ir
// dentro de un iframe; el resto del sitio mantiene frame-ancestors 'none'.
const embedHeaders = [
  {
    key: "Content-Security-Policy",
    value: [...ContentSecurityPolicy.replace(/frame-ancestors 'none';/u, "frame-ancestors *;")].join("; "),
  },
  // sin X-Frame-Options en embed: CSP frame-ancestors es el control moderno.
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // D40: slugs inactivos -> 308 real (antes solo meta refresh en el stream).
  async redirects() {
    return [
      { source: "/portfolio/inverse-cramer", destination: "/portfolio/inverse-cramer-real", permanent: true },
      { source: "/portfolio/afp-multifondos", destination: "/portfolio/afp-consenso-chile", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: embedHeaders,
      },
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
