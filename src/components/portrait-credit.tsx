import { cn } from "@/lib/utils";

/**
 * PortraitCredit — crédito de la foto del portafolio.
 *
 * Dos orígenes posibles (ver migraciones 055 y 056):
 * - Retrato oficial de dominio público de un cargo público de EE.UU.
 * - Foto con licencia libre de Wikimedia Commons (dominio público, CC BY,
 *   CC BY-SA): se muestra autor y licencia, con enlace a la ficha original,
 *   como exigen esas licencias.
 * Componente de servidor: no necesita interactividad.
 */

interface PortraitCreditProps {
  /** URL de la fuente (bioguide, Casa Blanca o ficha en Wikimedia Commons). */
  portraitSource: string | null | undefined;
  /** Licencia (p. ej. "CC BY 2.0", "Dominio público"). */
  portraitLicense?: string | null;
  /** Autor de la foto (solo fotos de Wikimedia Commons). */
  portraitAuthor?: string | null;
  className?: string;
}

export function portraitCreditText(
  portraitSource: string | null | undefined,
  portraitLicense?: string | null,
  portraitAuthor?: string | null,
): string {
  const isCommons = portraitSource?.includes("commons.wikimedia.org") ?? false;
  if (!isCommons) return "Foto: retrato oficial, dominio público";
  const license = portraitLicense?.trim() || "licencia libre";
  const author = portraitAuthor?.trim();
  return author
    ? `Foto: ${author} · ${license} · Wikimedia Commons`
    : `Foto: ${license} · Wikimedia Commons`;
}

export function PortraitCredit({
  portraitSource,
  portraitLicense,
  portraitAuthor,
  className,
}: PortraitCreditProps) {
  const text = portraitCreditText(portraitSource, portraitLicense, portraitAuthor);
  const classes = cn("text-[11px] text-neutral-500", className);
  if (portraitSource?.startsWith("https://")) {
    return (
      <p className={classes}>
        <a
          href={portraitSource}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:underline"
        >
          {text}
        </a>
      </p>
    );
  }
  return <p className={classes}>{text}</p>;
}
