/** Preferencias de alertas de compra/venta por portafolio seguido (D31). */
export interface TradeAlertPref {
  portfolioId: string;
  slug: string;
  name: string;
  emailBuys: boolean;
  emailSells: boolean;
}

/** Une los portafolios seguidos con sus preferencias (sin fila = ambos activados). */
export function mergeTradeAlertPrefs(
  followed: { id: string; slug: string; name: string }[],
  rows: { portfolio_id?: unknown; email_buys?: unknown; email_sells?: unknown }[],
): TradeAlertPref[] {
  const byId = new Map<string, { email_buys?: unknown; email_sells?: unknown }>();
  for (const row of rows ?? []) if (typeof row.portfolio_id === "string") byId.set(row.portfolio_id, row);
  return followed
    .map((p) => {
      const r = byId.get(p.id);
      return {
        portfolioId: p.id,
        slug: p.slug,
        name: p.name,
        emailBuys: r?.email_buys === false ? false : true,
        emailSells: r?.email_sells === false ? false : true,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
