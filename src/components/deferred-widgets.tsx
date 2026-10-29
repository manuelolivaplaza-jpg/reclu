"use client";

import dynamic from "next/dynamic";

/** Chat IA cargado en diferido y solo en cliente (no bloquea la hidratación). */
export const DeferredAiChatWidget = dynamic(
  () => import("@/components/ai-chat-widget").then((mod) => mod.AiChatWidget),
  { ssr: false },
);

/**
 * d65: Speed Insights fuera del bundle inicial: se carga en diferido, solo en
 * cliente. El layout lo monta únicamente en producción (VERCEL_ENV).
 */
export const DeferredSpeedInsights = dynamic(
  () => import("@vercel/speed-insights/next").then((mod) => mod.SpeedInsights),
  { ssr: false },
);
