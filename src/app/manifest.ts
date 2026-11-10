import type { MetadataRoute } from "next";

/**
 * Web App Manifest — PWA instalable.
 * Identidad: blanco/negro, marca "Fraccion", standalone tipo app nativa.
 * Los íconos PNG se sirven desde /public/icons (192 y 512, + maskable).
 */

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fraccion — Seguimiento de portafolios",
    short_name: "Fraccion",
    description:
      "Sigue los portafolios de políticos de EE.UU., corredoras chilenas y fondos. Recibe alertas por email cuando hay cambios.",
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
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
