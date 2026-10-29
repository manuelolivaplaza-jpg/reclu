import { cn } from "@/lib/utils";

/**
 * PortraitCredit â€” crÃ©dito de la foto del portafolio.
 *
 * Dos orÃ­genes posibles (ver migraciones 055 y 056):
 * - Retrato oficial de dominio pÃºblico de un cargo pÃºblico de EE.UU.
 * - Foto con licencia libre de Wikimedia Commons (dominio pÃºblico, CC BY,
 *   CC BY-SA): se muestra autor y licencia, con enlace a la ficha original,
 *   como exigen esas licencias.
 * Componente de servidor: no necesita interactividad.
 */

interface PortraitCreditProps {
  /** URL de la fuente (bioguide, Casa Blanca o ficha en Wikimedia Commons). */
  portraitSource: string | null | undefined;
  /** Licencia (p. ej. "CC BY 2.0", "Dominio pÃºblico"). */
  portraitLicense?: string | null;
  /** Autor de la foto (solo fotos de Wikimedia Commons). */
  portraitAuthor?: string | null;
  className?: string;
}

/** true si la fuente es un sitio de gobierno de EE.UU. (.gov/.mil). */
export function isOfficialPortraitSource(source: string | null | undefined): boolean {
  if (!source) return true;
  try {
    const host = new URL(source).hostname.toLowerCase();
    return host.endsWith(".gov") || host.endsWith(".mil");
  } catch {
    return false;
  }
}

/** true si el archivo de /portraits es un logo (no un retrato). */
export function isLogoImage(image: string | null | undefined): boolean {
  return !!image && /(^|\/|-)logo(-|\.|$)/i.test(image);
}

export function portraitCreditText(
  portraitSource: string | null | undefined,
  portraitLicense?: string | null,
  portraitAuthor?: string | null,
): string {
  const isCommons = portraitSource?.includes("commons.wikimedia.org") ?? false;
  if (!isCommons) {
    // D70: solo los retratos de cargos pÃºblicos de EE.UU. (.gov) son
    // "retrato oficial". Los logos de corredoras/fondos (Renta 4, MBI...)
    // no son de dominio pÃºblico: se acreditan a su titular.
    return isOfficialPortraitSource(portraitSource)
      ? "Foto: retrato oficial, dominio pÃºblico"
      : "Logo: marca de su titular, uso referencial";
  }
  const license = portraitLicense?.trim() || "licencia libre";
  const author = portraitAuthor?.trim();
  return author
    ? `Foto: ${author} Â· ${license} Â· Wikimedia Commons`
    : `Foto: ${license} Â· Wikimedia Commons`;
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
