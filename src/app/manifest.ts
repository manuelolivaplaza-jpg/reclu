import type { MetadataRoute } from "next";

/**
 * Web App Manifest — PWA instalable.
 * Identidad: blanco/negro, marca "reclu", standalone tipo app nativa.
 * Los íconos PNG se sirven desde /public/icons (192 y 512, + maskable).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "reclu — Seguimiento de portafolios",
    short_name: "reclu",
    description:
      "Sigue los portafolios de políticos de EE.UU., corredoras chilenas y fondos. Recibe alertas por email con análisis AI cuando hay cambios.",
    start_url: "/?utm_source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "es-CL",
    categories: ["finance", "news", "productivity"],
    icons: [
      {
        url: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        url: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        url: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
