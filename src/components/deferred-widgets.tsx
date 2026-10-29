"use client";

import dynamic from "next/dynamic";

/** Chat IA cargado en diferido y solo en cliente (no bloquea la hidratación). */
export const DeferredAiChatWidget = dynamic(
  () => import("@/components/ai-chat-widget").then((mod) => mod.AiChatWidget),
  { ssr: false },
);
