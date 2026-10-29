import { JsonLd } from "@/components/json-ld";
import { organizationSchema, websiteSchema } from "@/lib/seo";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { DeferredAiChatWidget } from "@/components/deferred-widgets";
import { PwaRegister } from "@/components/pwa-register";
import { siteUrl } from "@/lib/site";
import { plausibleDomain } from "@/lib/analytics";
import "./globals.css";

/**
 * Fuente global: Inter (next/font/google, sin instalar nada).
 * La variable CSS es `--font-sans` y la consume el tema de Tailwind
 * (ver `src/app/globals.css`). Pesos variables 100–900 en un solo archivo.
 */
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const SITE = siteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "reclu.cl — Seguimiento de portafolios y alertas inteligentes",
    template: "%s · reclu.cl",
  },
  description:
    "Sigue los portafolios de políticos de EE.UU., corredoras chilenas y fondos. Recibe alertas por email con análisis AI cuando hay cambios.",
  keywords: [
    "portafolios",
    "trading",
    "alertas",
    "Pelosi tracker",
    "Renta 4",
    "inversiones Chile",
    "seguimiento inversiones",
  ],
  authors: [{ name: "reclu.cl" }],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/icon.svg",
  },
  openGraph: {
    title: "reclu.cl — Seguimiento de portafolios y alertas inteligentes",
    description:
      "Sigue los portafolios que mueven el mercado. Alertas por email con análisis AI.",
    siteName: "reclu.cl",
    locale: "es_CL",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "reclu.cl — Seguimiento de portafolios y alertas inteligentes",
    description:
      "Sigue los portafolios que mueven el mercado. Alertas por email con análisis AI.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CL" className={`${inter.variable} h-full antialiased`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body className="flex min-h-full flex-col bg-background text-ink-900">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[100] focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Saltar al contenido
        </a>
        {children}
        {/* Analítica sin cookies: Plausible solo si NEXT_PUBLIC_PLAUSIBLE_DOMAIN
            está definido (script exempt, tagged-events para track()).
            Vercel Analytics: habilitar en el dashboard (ver NOTAS-F6.md). */}
        {plausibleDomain() && (
          <script
            defer
            data-domain={plausibleDomain() ?? ""}
            src="https://plausible.io/js/script.tagged-events.js"
          />
        )}
        <JsonLd data={organizationSchema()} />
        <JsonLd data={websiteSchema()} />
        <DeferredAiChatWidget />
        <SpeedInsights />
        <PwaRegister />
      </body>
    </html>
  );
}
