import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import { AiChatWidget } from "@/components/ai-chat-widget";
import "./globals.css";

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://reclu.cl"),
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
    url: "https://reclu.cl",
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
    <html lang="es" className={`${instrument.variable} h-full antialiased`}>
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
        <AiChatWidget />
      </body>
    </html>
  );
}
