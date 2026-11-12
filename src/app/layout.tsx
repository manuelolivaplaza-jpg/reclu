import { JsonLd } from "@/components/json-ld";
import { organizationSchema, websiteSchema } from "@/lib/seo";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { DeferredAiChatWidget, DeferredSpeedInsights } from "@/components/deferred-widgets";
import { PwaRegister } from "@/components/pwa-register";
import { siteUrl } from "@/lib/site";
import { BRAND_NAME } from "@/lib/brand";
import { plausibleDomain } from "@/lib/analytics";
import { aiEnabled } from "@/lib/ai-flags";
import "./globals.css";

/**
 * Fuente global: Inter variable, self-hosteada con `next/font/local`.
 * Proviene de `@fontsource-variable/inter` (subconjunto latin, eje wght
 * 100–900 en un único archivo). Se evita `next/font/google` para que el
 * build no dependa de fonts.googleapis.com.
 * La variable CSS es `--font-sans` y la consume el tema de Tailwind
 * (ver `src/app/globals.css`).
 */
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "100 900",
  style: "normal",
  fallback: [
    "Inter",
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

const SITE = siteUrl();

const TITLE = `${BRAND_NAME} — Seguimiento de portafolios y alertas`;
const DESCRIPTION =
  "Sigue los portafolios de políticos de EE.UU., corredoras chilenas y fondos. Recibe alertas por email cuando hay cambios.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  applicationName: BRAND_NAME,
  title: {
    default: TITLE,
    template: `%s · ${BRAND_NAME}`,
  },
  description: DESCRIPTION,
  keywords: [
    "portafolios",
    "trading",
    "alertas",
    "Pelosi tracker",
    "Renta 4",
    "inversiones Chile",
    "seguimiento inversiones",
  ],
  authors: [{ name: BRAND_NAME }],
  creator: BRAND_NAME,
  publisher: BRAND_NAME,
  category: "finance",
  // Sin autodetección de teléfonos/direcciones en iOS: son cifras y fechas.
  formatDetection: { telephone: false, address: false, email: false },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/icon.svg",
  },
  openGraph: {
    title: TITLE,
    description: "Sigue los portafolios que mueven el mercado. Alertas por email cuando hay cambios.",
    siteName: BRAND_NAME,
    locale: "es_CL",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: "Sigue los portafolios que mueven el mercado. Alertas por email cuando hay cambios.",
  },
  appleWebApp: {
    capable: true,
    title: BRAND_NAME,
    statusBarStyle: "default",
  },
};

/**
 * `viewport` es el API de Next 16 para estas etiquetas (no se escriben a mano
 * en `<head>`). El sitio es blanco editorial siempre: una sola barra del
 * navegador en blanco y controles nativos en modo claro.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CL" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <a href="#main" className="skip-link">
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
        {/* Sin clave de OpenRouter no se monta el chat (flag server-side). */}
        {aiEnabled() ? <DeferredAiChatWidget /> : null}
        {/* d65: medición real solo en producción y fuera del JS inicial. */}
        {process.env.VERCEL_ENV === "production" ? <DeferredSpeedInsights /> : null}
        <PwaRegister />
      </body>
    </html>
  );
}
