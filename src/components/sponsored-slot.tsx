/**
 * F56 — Espacio patrocinado rotulado (APAGADO por defecto).
 *
 * Componente de servidor: solo renderiza si
 * NEXT_PUBLIC_SPONSORS_ENABLED === "true". La etiqueta "Patrocinado"
 * es obligatoria y el enlace lleva rel="sponsored".
 *
 * Un patrocinio no puede ser un portafolio ni una alerta: el tipo
 * SponsorshipPlacement excluye esas ubicaciones y el slot debe
 * montarse fuera de las tablas de posiciones y del flujo de alertas.
 */

import { SPONSORED_LABEL } from "@/lib/legal";

/** Ubicaciones editoriales permitidas. Nunca "portfolio" ni "alerts". */
export const SPONSORABLE_PLACEMENTS = [
  "home",
  "explore",
  "dashboard",
  "compare",
  "aprende",
  "herramientas",
] as const;

export type SponsorshipPlacement = (typeof SPONSORABLE_PLACEMENTS)[number];

export interface SponsoredSlotProps {
  /** Nombre del patrocinador (visible en el descargo). */
  name: string;
  /** Destino https del patrocinador. */
  url: string;
  /** Texto breve de la campaña, sin promesas de rentabilidad. */
  text: string;
  placement: SponsorshipPlacement;
}

/** Lee la flag en cada render para poder probarla y cambiarla por entorno. */
export function isSponsorsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.NEXT_PUBLIC_SPONSORS_ENABLED === "true";
}

export function SponsoredSlot({
  name,
  url,
  text,
  placement,
}: SponsoredSlotProps) {
  if (!isSponsorsEnabled()) return null;

  // Defensa mínima: solo enlaces https y ubicaciones editoriales.
  if (!url.startsWith("https://")) return null;
  if (!SPONSORABLE_PLACEMENTS.includes(placement)) return null;

  return (
    <aside
      aria-label={`Contenido patrocinado: ${name}`}
      data-placement={placement}
      className="border border-ink-200 p-5"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">
        {SPONSORED_LABEL}
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-900">{text}</p>
      <a
        href={url}
        target="_blank"
        rel="sponsored noopener noreferrer nofollow"
        className="mt-3 inline-block text-[13px] text-ink-900 underline underline-offset-4 hover:no-underline"
      >
        Conocer más
      </a>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
        Espacio pagado por {name}. No es una recomendación de inversión ni una
        cartera o alerta de fraccion.si.
      </p>
    </aside>
  );
}
