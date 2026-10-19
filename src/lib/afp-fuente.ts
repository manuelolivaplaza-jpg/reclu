/**
 * Ficha de AFP Modelo (Superintendencia de Pensiones).
 * La fecha sale del `as_of` que ya devolvió `get_portfolio_holdings`:
 * no se pide otra lectura de holdings.
 */

export const AFP_MODELO_SLUG = "afp-modelo-acciones-cl";

/** Proxy usado porque Yahoo no trae el IPSA oficial. */
export const ECH_PROXY_LABEL = "ECH en CLP (proxy del IPSA)";

export const AVISO_DESFASE_SP =
  "La SP publica con desfase; no es la cartera de hoy.";

export const AVISO_SIMULACION =
  "Simulación histórica con fines informativos. No es recomendación de inversión.";

const CUADRO14 =
  "https://www.spensiones.cl/apps/carteras/genera_desagregada_xsl.php";

/** Último mes que el endpoint antiguo publicó (mayo 2026). */
const FEC_PRO_RESPALDO = "202605";

/** AAAAMM a partir de un `as_of` ISO, o null si la fecha no sirve. */
export function fecproDeAsOf(asOf: string | null | undefined): string | null {
  if (!asOf) return null;
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(asOf.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}${match[2]}`;
}

export function urlCuadro14(fecpro: string): string {
  return `${CUADRO14}?fecpro=${fecpro}&idu=50&listado=14`;
}

/** Enlace de la ficha. Sin fecha, apunta al último cuadro publicado. */
export function urlFuenteAfpModelo(asOf: string | null | undefined): string {
  return urlCuadro14(fecproDeAsOf(asOf) ?? FEC_PRO_RESPALDO);
}

/**
 * URL que detect-changes copia al payload de new_trade / weight_change.
 * Solo AFP Modelo. Sin fecha válida no inventa un mes.
 */
export function sourceUrlAlertaAfp(
  portfolio: { slug?: string | null; source?: string | null } | null | undefined,
  asOf: string | null | undefined,
): string | null {
  if (portfolio?.source !== "spensiones" || portfolio.slug !== AFP_MODELO_SLUG) {
    return null;
  }
  const fecpro = fecproDeAsOf(asOf);
  return fecpro ? urlCuadro14(fecpro) : null;
}

/** 2026-05-29 → 29-05-2026. */
export function fechaCartera(asOf: string | null | undefined): string | null {
  if (!asOf) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(asOf.trim());
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/** Corte más nuevo entre los holdings que el plan ya puede ver. */
export function latestAsOf(holdings: { as_of?: string | null }[]): string | null {
  let best: string | null = null;
  for (const holding of holdings) {
    const raw = holding.as_of?.trim() ?? "";
    if (!fechaCartera(raw)) continue;
    const iso = raw.slice(0, 10);
    if (best === null || iso > best) best = iso;
  }
  return best;
}

/** https de spensiones.cl, para pintar el enlace de una alerta. */
export function enlaceSpensiones(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname !== "www.spensiones.cl" && url.hostname !== "spensiones.cl") return null;
  return url.toString();
}
