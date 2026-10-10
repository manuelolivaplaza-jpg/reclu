import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
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
  openGraph: {
    title: "reclu.cl — Seguimiento de portafolios y alertas inteligentes",
    description:
      "Sigue los portafolios que mueven el mercado. Alertas por email con análisis AI.",
    url: "https://reclu.cl",
    siteName: "reclu.cl",
    locale: "es_CL",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-ink-900">
        {children}
      </body>
    </html>
  );
}
