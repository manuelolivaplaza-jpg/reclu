import { cn } from "@/lib/utils";

/**
 * PortraitCredit — crédito del retrato oficial (D4).
 *
 * Se muestra SOLO cuando el portafolio tiene retrato: la licencia es
 * dominio público de obra federal de EE.UU., pero el origen se acredita
 * igual (title = URL del retrato original). Componente de servidor: no
 * necesita interactividad.
 */

interface PortraitCreditProps {
  /** URL del retrato original (bioguide.congress.gov, Casa Blanca...). */
  portraitSource: string | null | undefined;
  className?: string;
}

export function PortraitCredit({
  portraitSource,
  className,
}: PortraitCreditProps) {
  return (
    <p
      title={portraitSource ?? undefined}
      className={cn("text-[11px] text-neutral-500", className)}
    >
      Foto: retrato oficial, dominio público
    </p>
  );
}
