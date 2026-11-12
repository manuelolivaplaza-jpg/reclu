/**
 * M5 — Afiliados de corredoras (APAGADO por defecto).
 *
 * Componente de servidor: solo renderiza si
 * NEXT_PUBLIC_AFFILIATES_ENABLED === "true". El texto legal es obligatorio:
 * los enlaces de afiliado NO son recomendación de inversión y el programa
 * requiere revisión legal/CMF antes de activarse en producción.
 */

import { ExternalLink } from "lucide-react";

export interface BrokerAffiliateProps {
  /** Enlace de afiliado completo (con tracking) — lo inyecta la página. */
  href: string;
  brokerName: string;
  /** Descripción corta de la oferta (ej. "Cuenta corriente sin costos"). */
  offer?: string;
}

export function BrokerAffiliate({ href, brokerName, offer }: BrokerAffiliateProps) {
  const enabled = process.env.NEXT_PUBLIC_AFFILIATES_ENABLED === "true";
  if (!enabled) return null;

  return (
    <aside className="border border-ink-200 p-5" aria-label={`Enlace de afiliado ${brokerName}`}>
      <p className="text-[13px] font-medium text-ink-900">
        Abre cuenta en {brokerName}
        {offer ? <span className="font-normal text-ink-500"> · {offer}</span> : null}
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow sponsored"
        className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-ink-900 underline-offset-4 hover:underline"
      >
        Ir a {brokerName}
        <ExternalLink className="size-3.5" strokeWidth={1.5} />
      </a>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
        Enlace de afiliado: fraccion.si puede recibir una comisión si abres cuenta. Esto no es
        una recomendación de inversión ni de corredora; la información de este sitio no
        constituye asesoría financiera.
      </p>
    </aside>
  );
}
