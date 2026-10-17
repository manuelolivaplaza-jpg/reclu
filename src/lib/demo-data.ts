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
  // --- Fondos 13F institucionales y soberanos (Wave 2) ---
  p({ id: "d23", slug: "berkshire-hathaway", name: "Berkshire Hathaway", description: "El libro 13F de Warren Buffett: posiciones listadas en EE.UU. al cierre de cada trimestre.", category: "hedge_fund", source: "sec_13f", manager: "Warren Buffett", country: "US", followers: 18900, return_ytd: 22.4, tags: ["buffett", "13f", "value"] }),
  p({ id: "d24", slug: "pershing-square", name: "Pershing Square", description: "El libro 13F de Bill Ackman: cartera concentrada de convicción.", category: "hedge_fund", source: "sec_13f", manager: "Bill Ackman", country: "US", followers: 9200, return_ytd: 19.8, premium: true, tags: ["ackman", "13f", "activista"] }),
  p({ id: "d25", slug: "duquesne-family-office", name: "Duquesne Family Office", description: "El family office de Stanley Druckenmiller, alta rotación y foco en crecimiento.", category: "hedge_fund", source: "sec_13f", manager: "Stanley Druckenmiller", country: "US", followers: 11400, return_ytd: 34.6, premium: true, tags: ["druckenmiller", "13f", "family-office"] }),
  p({ id: "d26", slug: "scion-asset-management", name: "Scion Asset Management", description: "El libro 13F de Michael Burry, famoso por la tesis de The Big Short.", category: "hedge_fund", source: "sec_13f", manager: "Michael Burry", country: "US", followers: 14200, return_ytd: 27.1, premium: true, tags: ["burry", "13f", "contrarian"] }),
  p({ id: "d27", slug: "appaloosa-lp", name: "Appaloosa Management", description: "El libro 13F de David Tepper: distressed y equity concentrado.", category: "hedge_fund", source: "sec_13f", manager: "David Tepper", country: "US", followers: 6800, return_ytd: 29.5, premium: true, tags: ["tepper", "13f", "distressed"] }),
  p({ id: "d28", slug: "tci-fund", name: "TCI Fund Management", description: "El fondo de Christopher Hohn: activismo con posiciones concentradas.", category: "hedge_fund", source: "sec_13f", manager: "Christopher Hohn", country: "Global", followers: 5400, return_ytd: 26.2, premium: true, tags: ["hohn", "13f", "activista"] }),
  p({ id: "d29", slug: "pif-saudi", name: "Public Investment Fund (PIF)", description: "El fondo soberano de Arabia Saudita: posiciones globales vía filings 13F.", category: "hedge_fund", source: "sec_13f", manager: "Fondo Soberano", country: "Global", followers: 7100, return_ytd: 16.9, premium: true, tags: ["soberano", "13f", "vision-2030"] }),
  // --- Congreso y Senado EE.UU. (Wave 2) ---
  p({ id: "d30", slug: "gottheimer-tracker", name: "Josh Gottheimer Tracker", description: "Operaciones declaradas por Joshua Gottheimer (D-NJ, Financial Services), uno de los congresistas más activos.", category: "political_us", source: "congress_invests", manager: "Josh Gottheimer", country: "US", followers: 4900, return_ytd: 24.7, tags: ["congreso", "financial-services", "active-trader"] }),
  p({ id: "d31", slug: "tuberville-tracker", name: "Tommy Tuberville Tracker", description: "Operaciones del senador Tommy Tuberville (R-AL, Armed Services), seguido por volumen y timing.", category: "political_us", source: "congress_invests", manager: "Tommy Tuberville", country: "US", followers: 6300, return_ytd: 21.3, tags: ["senado", "armed-services", "opciones"] }),
  p({ id: "d32", slug: "mccaul-tracker", name: "Michael McCaul Tracker", description: "Operaciones declaradas por Michael McCaul (R-TX, Foreign Affairs), uno de los libros más grandes en dólares.", category: "political_us", source: "congress_invests", manager: "Michael McCaul", country: "US", followers: 4100, return_ytd: 19.4, tags: ["congreso", "foreign-affairs", "large-book"] }),
  p({ id: "d33", slug: "mccormick-tracker", name: "David McCormick Tracker", description: "Operaciones del senador David McCormick (R-PA, Banking), ex CEO de Bridgewater, libro muy concentrado.", category: "political_us", source: "congress_invests", manager: "David McCormick", country: "US", followers: 5200, return_ytd: 25.8, premium: true, tags: ["senado", "banking", "bridgewater"] }),
  // --- Corredoras Chile (Wave 2) ---
  p({ id: "d34", slug: "btg-cartera-recomendada", name: "BTG Pactual — Cartera Recomendada 5", description: "Cartera Concentrada de acciones IPSA del equipo de research de BTG Pactual Chile.", category: "broker_cl", source: "btg", manager: "BTG Pactual", country: "CL", followers: 4600, return_ytd: 15.4, tags: ["chile", "btg", "ipsa"] }),
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
  // --- Fondos 13F (Wave 2): libros trimestrales del último filing ---
  "berkshire-hathaway": [
    { id: "h47", symbol: "AAPL", name: "Apple Inc", weight: 23.4, previous_weight: 25.1, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 224.31, price_current: 258.24, return_pct: 15.1 },
    { id: "h48", symbol: "AXP", name: "American Express", weight: 15.7, previous_weight: 15.2, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 265.53, price_current: 310.85, return_pct: 17.1 },
    { id: "h49", symbol: "BAC", name: "Bank of America", weight: 11.2, previous_weight: 12.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 40.12, price_current: 46.29, return_pct: 15.4 },
    { id: "h50", symbol: "KO", name: "Coca-Cola Co", weight: 10.8, previous_weight: 10.6, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 63.72, price_current: 71.19, return_pct: 11.7 },
    { id: "h51", symbol: "CVX", name: "Chevron Corp", weight: 7.3, previous_weight: 6.8, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 156.35, price_current: 172.04, return_pct: 10.0 },
    { id: "h52", symbol: "OXY", name: "Occidental Petroleum", weight: 5.6, previous_weight: 4.9, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 48.71, price_current: 53.86, return_pct: 10.6 },
    { id: "h53", symbol: "CB", name: "Chubb Ltd", weight: 4.8, previous_weight: 4.4, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 271.44, price_current: 302.16, return_pct: 11.3 },
  ],
  "pershing-square": [
    { id: "h54", symbol: "HLT", name: "Hilton Worldwide", weight: 24.5, previous_weight: 23.8, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 232.18, price_current: 261.75, return_pct: 12.7 },
    { id: "h55", symbol: "QSR", name: "Restaurant Brands Intl", weight: 20.1, previous_weight: 19.4, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 71.83, price_current: 82.46, return_pct: 14.8 },
    { id: "h56", symbol: "CMG", name: "Chipotle Mexican Grill", weight: 16.3, previous_weight: 17.1, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 52.09, price_current: 58.63, return_pct: 12.6 },
    { id: "h57", symbol: "GOOGL", name: "Alphabet Inc (Clase A)", weight: 14.2, previous_weight: 13.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 189.67, price_current: 237.42, return_pct: 25.2 },
    { id: "h58", symbol: "CP", name: "Canadian Pacific Kansas City", weight: 13.7, previous_weight: 14.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 84.51, price_current: 91.27, return_pct: 8.0 },
    { id: "h59", symbol: "BN", name: "Brookfield Corp", weight: 11.2, previous_weight: 10.9, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 56.24, price_current: 64.38, return_pct: 14.5 },
  ],
  "duquesne-family-office": [
    { id: "h60", symbol: "NTRA", name: "Natera Inc", weight: 16.8, previous_weight: 14.2, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 151.85, price_current: 218.32, return_pct: 43.8 },
    { id: "h61", symbol: "CPNG", name: "Coupang Inc", weight: 13.5, previous_weight: 13.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 26.24, price_current: 31.84, return_pct: 21.3 },
    { id: "h62", symbol: "COHR", name: "Coherent Corp", weight: 12.9, previous_weight: 11.6, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 92.75, price_current: 121.45, return_pct: 30.9 },
    { id: "h63", symbol: "TSM", name: "Taiwan Semiconductor", weight: 12.4, previous_weight: 13.1, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 178.42, price_current: 225.61, return_pct: 26.4 },
    { id: "h64", symbol: "NVDA", name: "NVIDIA Corp", weight: 11.8, previous_weight: 10.3, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 138.21, price_current: 196.58, return_pct: 42.2 },
    { id: "h65", symbol: "MSFT", name: "Microsoft Corp", weight: 10.6, previous_weight: 11.2, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 415.28, price_current: 481.90, return_pct: 16.0 },
    { id: "h66", symbol: "EL", name: "Estée Lauder", weight: 6.2, previous_weight: 7.4, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 82.15, price_current: 90.13, return_pct: 9.7 },
  ],
  "scion-asset-management": [
    { id: "h67", symbol: "BABA", name: "Alibaba Group", weight: 19.8, previous_weight: 17.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 88.42, price_current: 118.16, return_pct: 33.7 },
    { id: "h68", symbol: "JD", name: "JD.com Inc", weight: 16.5, previous_weight: 15.8, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 33.21, price_current: 42.55, return_pct: 28.1 },
    { id: "h69", symbol: "BIDU", name: "Baidu Inc", weight: 13.2, previous_weight: 14.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 105.36, price_current: 121.87, return_pct: 15.7 },
    { id: "h70", symbol: "HCA", name: "HCA Healthcare", weight: 12.6, previous_weight: 12.1, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 331.25, price_current: 389.84, return_pct: 17.7 },
    { id: "h71", symbol: "CITI", name: "Citigroup Inc", weight: 11.4, previous_weight: 10.2, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 62.48, price_current: 79.15, return_pct: 26.7 },
    { id: "h72", symbol: "AAPL", name: "Apple Inc", weight: 9.3, previous_weight: 10.6, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 224.31, price_current: 258.24, return_pct: 15.1 },
  ],
  "appaloosa-lp": [
    { id: "h73", symbol: "META", name: "Meta Platforms", weight: 15.8, previous_weight: 14.6, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 563.72, price_current: 704.18, return_pct: 24.9 },
    { id: "h74", symbol: "MSFT", name: "Microsoft Corp", weight: 13.5, previous_weight: 12.8, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 415.28, price_current: 481.90, return_pct: 16.0 },
    { id: "h75", symbol: "AMZN", name: "Amazon.com Inc", weight: 12.6, previous_weight: 13.4, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 186.44, price_current: 226.73, return_pct: 21.6 },
    { id: "h76", symbol: "NVDA", name: "NVIDIA Corp", weight: 11.8, previous_weight: 10.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 138.21, price_current: 196.58, return_pct: 42.2 },
    { id: "h77", symbol: "PAG", name: "Penske Automotive", weight: 9.4, previous_weight: 9.8, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 152.86, price_current: 171.42, return_pct: 12.2 },
    { id: "h78", symbol: "CPNG", name: "Coupang Inc", weight: 8.2, previous_weight: 7.6, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 26.24, price_current: 31.84, return_pct: 21.3 },
  ],
  "tci-fund": [
    { id: "h79", symbol: "GE", name: "GE Aerospace", weight: 21.5, previous_weight: 20.3, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 176.42, price_current: 226.75, return_pct: 28.5 },
    { id: "h80", symbol: "V", name: "Visa Inc", weight: 19.3, previous_weight: 19.8, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 309.45, price_current: 352.19, return_pct: 13.8 },
    { id: "h81", symbol: "MCO", name: "Moody's Corp", weight: 15.2, previous_weight: 15.6, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 458.21, price_current: 509.63, return_pct: 11.2 },
    { id: "h82", symbol: "CP", name: "Canadian Pacific Kansas City", weight: 14.8, previous_weight: 14.2, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 84.51, price_current: 91.27, return_pct: 8.0 },
    { id: "h83", symbol: "CNI", name: "Canadian National Railway", weight: 14.5, previous_weight: 15.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 102.63, price_current: 113.88, return_pct: 11.0 },
    { id: "h84", symbol: "FER", name: "Ferrovial SE", weight: 14.7, previous_weight: 13.9, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 41.28, price_current: 47.92, return_pct: 16.1 },
  ],
  "pif-saudi": [
    { id: "h85", symbol: "TSLA", name: "Tesla Inc", weight: 14.6, previous_weight: 13.2, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 248.50, price_current: 334.07, return_pct: 34.4 },
    { id: "h86", symbol: "UBER", name: "Uber Technologies", weight: 12.3, previous_weight: 12.9, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 71.25, price_current: 88.42, return_pct: 24.1 },
    { id: "h87", symbol: "EA", name: "Electronic Arts", weight: 10.8, previous_weight: 11.4, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 158.42, price_current: 172.56, return_pct: 8.9 },
    { id: "h88", symbol: "GOOGL", name: "Alphabet Inc (Clase A)", weight: 10.2, previous_weight: 9.6, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 189.67, price_current: 237.42, return_pct: 25.2 },
    { id: "h89", symbol: "AMZN", name: "Amazon.com Inc", weight: 9.8, previous_weight: 10.4, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 186.44, price_current: 226.73, return_pct: 21.6 },
    { id: "h90", symbol: "NFLX", name: "Netflix Inc", weight: 8.9, previous_weight: 8.3, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 795.18, price_current: 1042.25, return_pct: 31.1 },
    { id: "h91", symbol: "MSFT", name: "Microsoft Corp", weight: 8.4, previous_weight: 8.8, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 415.28, price_current: 481.90, return_pct: 16.0 },
  ],
  // --- Políticos Wave 2: libros declarados en PTR ---
  "gottheimer-tracker": [
    { id: "h92", symbol: "MSFT", name: "Microsoft Corp", weight: 16.4, previous_weight: 15.2, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 415.28, price_current: 481.90, return_pct: 16.0 },
    { id: "h93", symbol: "AAPL", name: "Apple Inc", weight: 14.8, previous_weight: 15.6, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 224.31, price_current: 258.24, return_pct: 15.1 },
    { id: "h94", symbol: "NVDA", name: "NVIDIA Corp", weight: 13.2, previous_weight: 11.8, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 138.21, price_current: 196.58, return_pct: 42.2 },
    { id: "h95", symbol: "JPM", name: "JPMorgan Chase", weight: 11.6, previous_weight: 12.1, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 231.42, price_current: 268.85, return_pct: 16.2 },
    { id: "h96", symbol: "GOOGL", name: "Alphabet Inc (Clase A)", weight: 10.9, previous_weight: 10.4, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 189.67, price_current: 237.42, return_pct: 25.2 },
    { id: "h97", symbol: "META", name: "Meta Platforms", weight: 9.7, previous_weight: 9.1, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 563.72, price_current: 704.18, return_pct: 24.9 },
    { id: "h98", symbol: "V", name: "Visa Inc", weight: 8.4, previous_weight: 8.9, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 309.45, price_current: 352.19, return_pct: 13.8 },
  ],
  "tuberville-tracker": [
    { id: "h99", symbol: "NVDA", name: "NVIDIA Corp (opciones)", weight: 15.3, previous_weight: 13.9, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 138.21, price_current: 196.58, return_pct: 42.2 },
    { id: "h100", symbol: "AAPL", name: "Apple Inc", weight: 13.7, previous_weight: 14.4, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 224.31, price_current: 258.24, return_pct: 15.1 },
    { id: "h101", symbol: "DIS", name: "Walt Disney Co", weight: 12.1, previous_weight: 12.8, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 101.35, price_current: 112.68, return_pct: 11.2 },
    { id: "h102", symbol: "BA", name: "Boeing Co", weight: 11.4, previous_weight: 10.6, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 152.18, price_current: 178.42, return_pct: 17.2 },
    { id: "h103", symbol: "XOM", name: "Exxon Mobil", weight: 10.8, previous_weight: 11.2, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 117.24, price_current: 124.85, return_pct: 6.5 },
    { id: "h104", symbol: "KO", name: "Coca-Cola Co", weight: 9.6, previous_weight: 9.9, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 63.72, price_current: 71.19, return_pct: 11.7 },
    { id: "h105", symbol: "TSLA", name: "Tesla Inc", weight: 9.0, previous_weight: 8.2, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 248.50, price_current: 334.07, return_pct: 34.4 },
  ],
  "mccaul-tracker": [
    { id: "h106", symbol: "MSFT", name: "Microsoft Corp", weight: 15.8, previous_weight: 16.4, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 415.28, price_current: 481.90, return_pct: 16.0 },
    { id: "h107", symbol: "NVDA", name: "NVIDIA Corp", weight: 14.6, previous_weight: 13.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 138.21, price_current: 196.58, return_pct: 42.2 },
    { id: "h108", symbol: "AMD", name: "Advanced Micro Devices", weight: 12.4, previous_weight: 11.7, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 163.85, price_current: 194.28, return_pct: 18.6 },
    { id: "h109", symbol: "AAPL", name: "Apple Inc", weight: 11.9, previous_weight: 12.3, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 224.31, price_current: 258.24, return_pct: 15.1 },
    { id: "h110", symbol: "META", name: "Meta Platforms", weight: 10.7, previous_weight: 10.2, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 563.72, price_current: 704.18, return_pct: 24.9 },
    { id: "h111", symbol: "CRM", name: "Salesforce Inc", weight: 9.5, previous_weight: 9.8, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 254.63, price_current: 288.19, return_pct: 13.2 },
    { id: "h112", symbol: "AVGO", name: "Broadcom Inc", weight: 8.6, previous_weight: 8.1, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 168.42, price_current: 212.85, return_pct: 26.4 },
  ],
  "mccormick-tracker": [
    { id: "h113", symbol: "GOOGL", name: "Alphabet Inc (Clase A)", weight: 17.2, previous_weight: 16.1, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 189.67, price_current: 237.42, return_pct: 25.2 },
    { id: "h114", symbol: "MSFT", name: "Microsoft Corp", weight: 16.5, previous_weight: 17.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 415.28, price_current: 481.90, return_pct: 16.0 },
    { id: "h115", symbol: "AMZN", name: "Amazon.com Inc", weight: 14.8, previous_weight: 13.9, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 186.44, price_current: 226.73, return_pct: 21.6 },
    { id: "h116", symbol: "META", name: "Meta Platforms", weight: 13.4, previous_weight: 12.6, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 563.72, price_current: 704.18, return_pct: 24.9 },
    { id: "h117", symbol: "NVDA", name: "NVIDIA Corp", weight: 12.7, previous_weight: 11.9, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 138.21, price_current: 196.58, return_pct: 42.2 },
    { id: "h118", symbol: "JPM", name: "JPMorgan Chase", weight: 12.4, previous_weight: 13.1, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 231.42, price_current: 268.85, return_pct: 16.2 },
    { id: "h119", symbol: "LMT", name: "Lockheed Martin", weight: 13.0, previous_weight: 13.6, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 508.25, price_current: 552.44, return_pct: 8.7 },
  ],
  // --- BTG Pactual: composición real del informe Cartera Concentrada ---
  "btg-cartera-recomendada": [
    { id: "h120", symbol: "ANDINA-B", name: "Embotelladora Andina", weight: 14.3, previous_weight: 14.3, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: 7.81, price_current: 9.12, return_pct: 16.8 },
    { id: "h121", symbol: "AGUAS-A", name: "Aguas Andinas", weight: 14.3, previous_weight: 14.3, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: 26.89, price_current: 28.94, return_pct: 7.6 },
    { id: "h122", symbol: "FALABELLA", name: "Falabella S.A.", weight: 14.3, previous_weight: 14.3, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: 5.62, price_current: 6.47, return_pct: 15.1 },
    { id: "h123", symbol: "SANTANDER", name: "Banco Santander Chile", weight: 14.3, previous_weight: 14.3, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: 1.71, price_current: 1.84, return_pct: 7.6 },
    { id: "h124", symbol: "CMPC", name: "CMPC S.A.", weight: 14.3, previous_weight: 14.3, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: 51.86, price_current: 47.92, return_pct: -7.6 },
    { id: "h125", symbol: "LTM", name: "LATAM Airlines Group", weight: 14.3, previous_weight: 14.3, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: 51.88, price_current: 62.35, return_pct: 20.2 },
    { id: "h126", symbol: "SQM-B", name: "Soquimich (SQM)", weight: 14.3, previous_weight: 14.3, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: 21.10, price_current: 23.44, return_pct: 11.1 },
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
  { id: "a1", portfolio_id: "d1", type: "new_trade", severity: "high", title: "Nancy Pelosi compró $1M–$5M en NVDA", summary: "La congresista Pelosi realizó una compra significativa de NVIDIA vía opciones call, su tercera operación en semiconductores este trimestre.", payload: { tx_date: "2026-10-01", disclosed: "2026-10-09" }, created_at: "2026-10-09T14:00:00Z", portfolio: { id: "d1", slug: "pelosi-tracker", name: "Pelosi Tracker" } },
  { id: "a2", portfolio_id: "d1", type: "weight_change", severity: "medium", title: "TSLA: -3.0pp (ahora 9.0%)", summary: "Redujo su posición en Tesla en 3 puntos porcentuales tras la caída de entregaciones del trimestre.", payload: { tx_date: "2026-09-28", disclosed: "2026-10-08" }, created_at: "2026-10-08T10:00:00Z", portfolio: { id: "d1", slug: "pelosi-tracker", name: "Pelosi Tracker" } },
  { id: "a3", portfolio_id: "d7", type: "threshold", severity: "high", title: "NVDA superó el 20% del portafolio", summary: "El peso de NVIDIA en AI World War III cruzó el umbral del 20% tras la revalorización semanal.", payload: {}, created_at: "2026-10-07T16:00:00Z", portfolio: { id: "d7", slug: "ai-world-war", name: "AI World War III" } },
  { id: "a4", portfolio_id: "d3", type: "weight_change", severity: "low", title: "Renta 4 Moderada: ajuste mensual de COPEC", summary: "Renta 4 subió COPEC a 16% en su cartera moderada de octubre, citando valorización atractiva.", payload: {}, created_at: "2026-10-06T09:00:00Z", portfolio: { id: "d3", slug: "renta4-moderada", name: "Renta 4 — Cartera Moderada" } },
  // --- Alertas Wave 2: fondos 13F y políticos nuevos ---
  { id: "a5", portfolio_id: "d23", type: "13f_update", severity: "medium", title: "13F Q3: Berkshire recortó AAPL y subió OXY", summary: "El filing trimestral muestra una reducción de Apple por tercer trimestre consecutivo, compensada con energía y aseguradoras.", payload: { filed_at: "2026-10-03", traded_at: "2026-09-30" }, created_at: "2026-10-03T20:00:00Z", portfolio: { id: "d23", slug: "berkshire-hathaway", name: "Berkshire Hathaway" } },
  { id: "a6", portfolio_id: "d25", type: "13f_update", severity: "high", title: "Druckenmiller entró a NTRA con 16,8% del libro", summary: "Duquesne abrió una posición mayoritaria en Natera y elevó NVDA, manteniendo su sesgo hacia crecimiento y diagnóstico genético.", payload: { filed_at: "2026-10-02", traded_at: "2026-09-30" }, created_at: "2026-10-02T20:00:00Z", portfolio: { id: "d25", slug: "duquesne-family-office", name: "Duquesne Family Office" } },
  { id: "a7", portfolio_id: "d26", type: "13f_update", severity: "medium", title: "Scion sumó BABA hasta 19,8% del portafolio", summary: "Michael Burry aumentó la exposición a China vía Alibaba y JD.com, su apuesta contrarian más grande del año.", payload: { filed_at: "2026-10-01", traded_at: "2026-09-30" }, created_at: "2026-10-01T20:00:00Z", portfolio: { id: "d26", slug: "scion-asset-management", name: "Scion Asset Management" } },
  { id: "a8", portfolio_id: "d30", type: "new_trade", severity: "medium", title: "Gottheimer compró NVDA y JPM", summary: "Josh Gottheimer reportó compras de NVIDIA y JPMorgan en el rango $15K–$50K, alineadas con su foco en financieras.", payload: { tx_date: "2026-09-22", disclosed: "2026-10-05" }, created_at: "2026-10-05T12:00:00Z", portfolio: { id: "d30", slug: "gottheimer-tracker", name: "Josh Gottheimer Tracker" } },
  { id: "a9", portfolio_id: "d31", type: "new_trade", severity: "medium", title: "Tuberville compró opciones sobre NVDA", summary: "El senador Tuberville declaró compras de calls de NVIDIA, sumándose a su historial de operaciones en semis y defensa.", payload: { tx_date: "2026-09-24", disclosed: "2026-10-04" }, created_at: "2026-10-04T12:00:00Z", portfolio: { id: "d31", slug: "tuberville-tracker", name: "Tommy Tuberville Tracker" } },
  { id: "a10", portfolio_id: "d34", type: "weight_change", severity: "low", title: "BTG Cartera Concentrada: mantención mensual", summary: "La cartera recomendada de BTG mantiene sus siete acciones IPSA en pesos iguales, sin cambios tras el rebalanceo.", payload: {}, created_at: "2026-10-06T12:00:00Z", portfolio: { id: "d34", slug: "btg-cartera-recomendada", name: "BTG Pactual — Cartera Recomendada 5" } },
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
