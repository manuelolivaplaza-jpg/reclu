/**
 * Datos de demostración — se usan SOLO cuando Supabase no está configurado
 * (placeholder) o no responde. Permite ver y verificar el sitio completo
 * (incluido el paywall) antes de conectar el backend real.
 *
 * En cuanto Supabase responde con datos reales, estos NO se usan.
 * Son ilustrativos y coinciden con supabase/seed_holdings.sql.
 */

import type { Portfolio, Holding, Alert } from "@/lib/types";

const NOW = "2026-10-10T12:00:00Z";

function p(over: Partial<Portfolio> & Pick<Portfolio, "id" | "slug" | "name" | "description" | "category" | "source" | "country">): Portfolio {
  return {
    manager: null,
    followers: 1000,
    return_ytd: 12.5,
    premium: false,
    tags: [],
    cover_image: null,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

export const DEMO_PORTFOLIOS: Portfolio[] = [
  p({ id: "d1", slug: "pelosi-tracker", name: "Pelosi Tracker", description: "Sigue las operaciones bursátiles declaradas por Nancy Pelosi, ex presidenta de la Cámara de Representantes de EE.UU.", category: "political_us", source: "capitol_trades", manager: "Nancy Pelosi", country: "US", followers: 12400, return_ytd: 31.4, tags: ["pelosi", "congreso", "tech"] }),
  p({ id: "d2", slug: "trump-trades", name: "Trump Trades", description: "Operaciones bursátiles y menciones públicas de Donald Trump y su círculo cercano.", category: "political_us", source: "capitol_trades", manager: "Donald Trump", country: "US", followers: 8300, return_ytd: 18.2, tags: ["trump", "menciones"] }),
  p({ id: "d3", slug: "renta4-moderada", name: "Renta 4 — Cartera Moderada", description: "Cartera moderada recomendada por Renta 4 Corredores de Bolsa (Chile).", category: "broker_cl", source: "renta4", manager: "Renta 4", country: "CL", followers: 5600, return_ytd: 12.6, tags: ["chile", "renta4", "moderada"] }),
  p({ id: "d4", slug: "renta4-moderada-ampliada", name: "Renta 4 — Cartera Moderada Ampliada", description: "Versión ampliada de la cartera moderada de Renta 4, con mayor diversificación.", category: "broker_cl", source: "renta4", manager: "Renta 4", country: "CL", followers: 3100, return_ytd: 11.1, tags: ["chile", "renta4", "ampliada"] }),
  p({ id: "d5", slug: "larrainvial-top-picks", name: "LarrainVial Top Picks", description: "Selección de acciones destacadas del equipo de research de LarrainVial.", category: "broker_cl", source: "larrainvial", manager: "LarrainVial", country: "CL", followers: 2900, return_ytd: 15.8, tags: ["chile", "larrainvial"] }),
  p({ id: "d6", slug: "btg-insights", name: "BTG Pactual Insights", description: "Carteras y recomendaciones de BTG Pactual Chile.", category: "broker_cl", source: "btg", manager: "BTG Pactual", country: "CL", followers: 1800, return_ytd: 13.4, tags: ["chile", "btg"] }),
  p({ id: "d7", slug: "ai-world-war", name: "AI World War III", description: "Tesis temática: empresas clave en la carrera global de inteligencia artificial.", category: "thematic", source: "model", country: "Global", followers: 9400, return_ytd: 42.8, tags: ["ia", "tech", "tematica"] }),
  p({ id: "d8", slug: "claude-portfolio", name: "Claude Portfolio", description: "Portafolio modelo enfocado en empresas del ecosistema Anthropic y AI.", category: "thematic", source: "model", country: "Global", followers: 6200, return_ytd: 28.3, premium: true, tags: ["ia", "anthropic", "tematica"] }),
  p({ id: "d9", slug: "inverse-cramer", name: "Inverse Cramer", description: "Estrategia contrarian basada en las recomendaciones de Jim Cramer.", category: "thematic", source: "model", country: "US", followers: 1200, return_ytd: 9.7, tags: ["contrarian", "media"] }),
  p({ id: "d10", slug: "bancos-chilenos", name: "Bancos Chilenos", description: "Las principales instituciones financieras que transan en la bolsa de Santiago.", category: "thematic", source: "model", country: "CL", followers: 3400, return_ytd: 16.2, tags: ["chile", "bancos", "financiero"] }),
  p({ id: "d11", slug: "retail-chileno", name: "Retail Chileno", description: "Grandes cadenas de retail y centros comerciales del IPSA.", category: "thematic", source: "model", country: "CL", followers: 2100, return_ytd: 10.4, tags: ["chile", "retail", "consumo"] }),
  p({ id: "d12", slug: "litio-mineria", name: "Litio y Minería", description: "Salmueras de litio y minería: el motor de commodities de Chile.", category: "thematic", source: "model", country: "CL", followers: 1500, return_ytd: 24.9, premium: true, tags: ["chile", "litio", "mineria"] }),
  p({ id: "d13", slug: "dividendos-ipsa", name: "Dividendos IPSA", description: "Acciones del IPSA con historial de reparto de dividendos.", category: "thematic", source: "model", country: "CL", followers: 1900, return_ytd: 8.8, tags: ["chile", "dividendos", "ipsa"] }),
  p({ id: "d14", slug: "energias-renovables", name: "Energías Renovables", description: "Generadoras y utilities enfocadas en transición energética.", category: "thematic", source: "model", country: "Global", followers: 2400, return_ytd: 14.1, tags: ["energia", "renovables", "utilities"] }),
  p({ id: "d15", slug: "sp500-top10", name: "S&P 500 Top 10", description: "Las diez mayores empresas del S&P 500 por capitalización.", category: "thematic", source: "model", country: "US", followers: 5100, return_ytd: 19.6, tags: ["usa", "sp500", "megacaps"] }),
  p({ id: "d16", slug: "semiconductores", name: "Carrera de Semiconductores", description: "Fabricantes y diseñadores de chips que lideran la demanda global de cómputo.", category: "thematic", source: "model", country: "Global", followers: 4700, return_ytd: 35.2, tags: ["semis", "tech", "ia"] }),
  p({ id: "d17", slug: "bonos-tesoro-us", name: "Bonos del Tesoro US", description: "Renta fija soberana de Estados Unidos como refugio defensivo.", category: "thematic", source: "model", country: "US", followers: 1300, return_ytd: 4.2, tags: ["bonos", "renta-fija", "defensivo"] }),
  p({ id: "d18", slug: "dividend-aristocrats", name: "Dividend Aristocrats", description: "Empresas de EE.UU. con 25+ años aumentando su dividendo.", category: "thematic", source: "model", country: "US", followers: 1600, return_ytd: 7.9, premium: true, tags: ["dividendos", "aristocrats", "defensivo"] }),
  p({ id: "d19", slug: "fintech-global", name: "Fintech Global", description: "Plataformas de pagos, neobancos e infraestructura financiera digital.", category: "thematic", source: "model", country: "Global", followers: 2800, return_ytd: 21.3, tags: ["fintech", "pagos", "tech"] }),
  p({ id: "d20", slug: "latin-tech", name: "Latin Tech", description: "Las mayores empresas de tecnología de Latinoamérica.", category: "thematic", source: "model", country: "Global", followers: 1700, return_ytd: 17.5, tags: ["latam", "tech", "emergentes"] }),
  p({ id: "d21", slug: "utilities-defensivas", name: "Utilities Defensivas", description: "Servicios básicos estables: agua, electricidad y gas.", category: "thematic", source: "model", country: "Global", followers: 1100, return_ytd: 6.3, tags: ["utilities", "defensivo", "dividendos"] }),
  p({ id: "d22", slug: "infoProbidad-cl", name: "Declaraciones InfoProbidad", description: "Seguimiento de declaraciones de patrimonio de autoridades chilenas (InfoProbidad).", category: "public_disclosure", source: "infoprobidad", country: "CL", followers: 800, return_ytd: 5.1, tags: ["chile", "infoprobidad"] }),
];

// Holdings de demostración por portfolio (id -> lista)
const DEMO_HOLDINGS: Record<string, Omit<Holding, "portfolio_id" | "as_of">[]> = {
  "pelosi-tracker": [
    { id: "h1", symbol: "NVDA", name: "NVIDIA Corp", weight: 18.5, previous_weight: 14.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h2", symbol: "AAPL", name: "Apple Inc", weight: 15.0, previous_weight: 16.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h3", symbol: "MSFT", name: "Microsoft Corp", weight: 14.0, previous_weight: 14.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h4", symbol: "GOOGL", name: "Alphabet Inc", weight: 12.0, previous_weight: 10.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h5", symbol: "AMZN", name: "Amazon.com Inc", weight: 10.5, previous_weight: 11.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h6", symbol: "TSLA", name: "Tesla Inc", weight: 9.0, previous_weight: 12.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h7", symbol: "CRM", name: "Salesforce Inc", weight: 8.0, previous_weight: 7.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h8", symbol: "PANW", name: "Palo Alto Networks", weight: 7.0, previous_weight: 5.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h9", symbol: "DIS", name: "Walt Disney Co", weight: 6.0, previous_weight: 9.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
  ],
  "renta4-moderada": [
    { id: "h10", symbol: "COPEC", name: "Empresas Copec", weight: 16.0, previous_weight: 15.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h11", symbol: "SQM-B", name: "SQM S.A.", weight: 14.0, previous_weight: 15.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h12", symbol: "BSANTANDER", name: "Banco Santander Chile", weight: 13.0, previous_weight: 13.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h13", symbol: "FALABELLA", name: "Falabella S.A.", weight: 12.0, previous_weight: 12.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h14", symbol: "CENCOSUD", name: "Cencosud S.A.", weight: 11.0, previous_weight: 10.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h15", symbol: "CMPC", name: "CMPC S.A.", weight: 10.0, previous_weight: 9.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h16", symbol: "ENELAM", name: "Enel Américas", weight: 12.0, previous_weight: 12.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h17", symbol: "CCU", name: "CCU S.A.", weight: 7.0, previous_weight: 8.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h18", symbol: "ANDINA-B", name: "Viña Concha y Toro", weight: 5.0, previous_weight: 6.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: null, price_current: null, return_pct: null },
  ],
  "ai-world-war": [
    { id: "h20", symbol: "NVDA", name: "NVIDIA Corp", weight: 20.0, previous_weight: 17.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h21", symbol: "TSM", name: "Taiwan Semiconductor", weight: 15.0, previous_weight: 15.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h22", symbol: "AMD", name: "Advanced Micro Devices", weight: 12.0, previous_weight: 11.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h23", symbol: "AVGO", name: "Broadcom Inc", weight: 12.0, previous_weight: 12.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h24", symbol: "MSFT", name: "Microsoft Corp", weight: 13.0, previous_weight: 13.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h25", symbol: "GOOGL", name: "Alphabet Inc", weight: 11.0, previous_weight: 12.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h26", symbol: "ASML", name: "ASML Holding", weight: 9.0, previous_weight: 9.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h27", symbol: "VST", name: "Vistra Corp (energía para DCs)", weight: 8.0, previous_weight: 11.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
  ],
  "claude-portfolio": [
    { id: "h28", symbol: "GOOGL", name: "Alphabet Inc (backer Anthropic)", weight: 18.0, previous_weight: 18.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h29", symbol: "AMZN", name: "Amazon.com (AWS/Anthropic)", weight: 16.0, previous_weight: 15.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h30", symbol: "MSFT", name: "Microsoft Corp", weight: 14.0, previous_weight: 14.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h31", symbol: "NVDA", name: "NVIDIA Corp (compute)", weight: 15.0, previous_weight: 15.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h32", symbol: "TSM", name: "Taiwan Semiconductor", weight: 11.0, previous_weight: 11.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h33", symbol: "ORCL", name: "Oracle Corp (OCI)", weight: 10.0, previous_weight: 10.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h34", symbol: "NOW", name: "ServiceNow (AI agents)", weight: 8.0, previous_weight: 8.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
  ],
  "bancos-chilenos": [
    { id: "h35", symbol: "BSANTANDER", name: "Banco Santander Chile", weight: 24.0, previous_weight: 23.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h36", symbol: "CHILE", name: "Banco de Chile", weight: 20.0, previous_weight: 20.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h37", symbol: "ITAUCORP", name: "Itaú CorpBanca", weight: 16.0, previous_weight: 17.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h38", symbol: "BCI", name: "Banco de Crédito e Inversiones", weight: 15.0, previous_weight: 15.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h39", symbol: "RIPLEY", name: "Banco Ripley", weight: 16.0, previous_weight: 16.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h40", symbol: "SECURITY", name: "Banco Security", weight: 9.0, previous_weight: 9.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: null, price_current: null, return_pct: null },
  ],
  "semiconductores": [
    { id: "h41", symbol: "NVDA", name: "NVIDIA Corp", weight: 22.0, previous_weight: 19.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h42", symbol: "TSM", name: "Taiwan Semiconductor", weight: 20.0, previous_weight: 20.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h43", symbol: "ASML", name: "ASML Holding", weight: 16.0, previous_weight: 16.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h44", symbol: "AVGO", name: "Broadcom Inc", weight: 15.0, previous_weight: 15.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h45", symbol: "AMD", name: "Advanced Micro Devices", weight: 13.0, previous_weight: 13.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h46", symbol: "QCOM", name: "Qualcomm", weight: 7.0, previous_weight: 8.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
  ],
};

export function demoPortfolioBySlug(slug: string): Portfolio | null {
  return DEMO_PORTFOLIOS.find((x) => x.slug === slug) ?? null;
}

export function demoHoldings(slug: string): Holding[] {
  const list = DEMO_HOLDINGS[slug];
  if (!list) return [];
  return list.map((h) => ({ ...h, portfolio_id: slug, as_of: "2026-10-10" }));
}

const DEMO_ALERTS: Alert[] = [
  { id: "a1", portfolio_id: "d1", type: "new_trade", severity: "high", title: "Nancy Pelosi compró $1M–$5M en NVDA", summary: "La congresista Pelosi realizó una compra significativa de NVIDIA vía opciones call, su tercera operación en semiconductores este trimestre.", payload: {}, created_at: "2026-10-09T14:00:00Z", portfolio: { id: "d1", slug: "pelosi-tracker", name: "Pelosi Tracker" } },
  { id: "a2", portfolio_id: "d1", type: "weight_change", severity: "medium", title: "TSLA: -3.0pp (ahora 9.0%)", summary: "Redujo su posición en Tesla en 3 puntos porcentuales tras la caída de entregaciones del trimestre.", payload: {}, created_at: "2026-10-08T10:00:00Z", portfolio: { id: "d1", slug: "pelosi-tracker", name: "Pelosi Tracker" } },
  { id: "a3", portfolio_id: "d7", type: "threshold", severity: "high", title: "NVDA superó el 20% del portafolio", summary: "El peso de NVIDIA en AI World War III cruzó el umbral del 20% tras la revalorización semanal.", payload: {}, created_at: "2026-10-07T16:00:00Z", portfolio: { id: "d7", slug: "ai-world-war", name: "AI World War III" } },
  { id: "a4", portfolio_id: "d3", type: "weight_change", severity: "low", title: "Renta 4 Moderada: ajuste mensual de COPEC", summary: "Renta 4 subió COPEC a 16% en su cartera moderada de octubre, citando valorización atractiva.", payload: {}, created_at: "2026-10-06T09:00:00Z", portfolio: { id: "d3", slug: "renta4-moderada", name: "Renta 4 — Cartera Moderada" } },
];

export function demoAlerts(portfolioId?: string): Alert[] {
  const filtered = portfolioId ? DEMO_ALERTS.filter((a) => a.portfolio_id === portfolioId) : DEMO_ALERTS;
  return filtered;
}

/**
 * Serie ilustrativa de evolución. Mismo seed en cada render (sin mismatch
 * de hidratación): arranca en 0% y termina exactamente en returnPct.
 * Fechas: los últimos `points` días de calendario, hasta hoy.
 */
export function demoPerformance(
  slug: string,
  returnPct: number,
  points = 90,
): { date: string; value: number }[] {
  const count = Number.isFinite(points) ? Math.max(2, Math.floor(points)) : 90;
  const target = Number.isFinite(returnPct) ? returnPct : 0;

  let seed = Math.abs(Math.round(target * 7)) + 3;
  for (let i = 0; i < slug.length; i++) {
    seed = (seed * 33 + slug.charCodeAt(i)) % 233280;
  }
  if (seed < 3) seed += 3;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  // Puente: camino con altibajos que se corrige para cerrar en returnPct.
  const walk: number[] = [0];
  const dailyVol = Math.max(0.25, Math.abs(target) * 0.045);
  let level = 0;
  for (let i = 1; i < count; i++) {
    level += (rand() - 0.5) * 2 * dailyVol;
    walk.push(level);
  }
  const endGap = target - (walk[count - 1] ?? 0);

  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const series: { date: string; value: number }[] = [];
  for (let i = 0; i < count; i++) {
    const day = new Date(end);
    day.setDate(end.getDate() - (count - 1 - i));
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, "0");
    const d = String(day.getDate()).padStart(2, "0");
    const t = i / (count - 1);
    const raw = (walk[i] ?? 0) + t * endGap;
    series.push({
      date: `${y}-${m}-${d}`,
      value: i === 0 ? 0 : i === count - 1 ? target : Math.round(raw * 100) / 100,
    });
  }
  return series;
}
