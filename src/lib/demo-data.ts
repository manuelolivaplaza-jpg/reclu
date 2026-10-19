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
  p({ id: "d13oge", slug: "trump-compra", name: "Trump compra (OGE)", description: "Compras de acciones y ETF de US$1 millón o más declaradas en el formulario OGE 278-T. Los montos son tramos, no cifras exactas. Simulación histórica con fines informativos. No es recomendación de inversión.", category: "political_us", source: "oge_278t", manager: "Donald Trump", country: "US", followers: 0, return_ytd: null, premium: false, tags: ["trump", "oge", "declaraciones"] }),
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
  p({ id: "d22", slug: "infoProbidad-cl", name: "Declaraciones InfoProbidad", description: "Empresas en las que autoridades chilenas declaran acciones, agregado por RUT (InfoProbidad, CC BY 4.0). Sirve para ver posibles conflictos de interés. No es una cartera para copiar ni una recomendación de inversión.", category: "public_disclosure", source: "infoprobidad", country: "CL", followers: 800, return_ytd: null, tags: ["chile", "infoprobidad"] }),
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
  // --- Señales Políticas, 13F Elite y Consenso Institucional (Wave 3) ---
  p({ id: "d35", slug: "trump-truth-signals", name: "Trump Truth & Tariffs Radar", description: "Monitorea menciones directas de empresas, aranceles y sectores estratégicos publicados por Donald Trump.", category: "political_us", source: "truth_social", manager: "Donald Trump", country: "US", followers: 19400, return_ytd: 36.4, premium: true, tags: ["trump", "menciones", "aranceles", "truth-social"] }),
  p({ id: "d36", slug: "elon-doge-tracker", name: "DOGE & Musk Ecosystem", description: "Empresas impactadas por recortes regulatorios, contratos aeroespaciales y menciones públicas de Elon Musk.", category: "thematic", source: "public_mentions", manager: "Elon Musk", country: "US", followers: 16800, return_ytd: 44.2, premium: true, tags: ["musk", "doge", "defensa", "espacio"] }),
  p({ id: "d37", slug: "khanna-tracker", name: "Ro Khanna Tracker", description: "Operaciones bursátiles declaradas por Ro Khanna (D-CA, Armed Services), representante del distrito de Silicon Valley.", category: "political_us", source: "house_clerk", manager: "Ro Khanna", country: "US", followers: 7400, return_ytd: 26.9, premium: false, tags: ["congreso", "silicon-valley", "tech"] }),
  p({ id: "d38", slug: "delbene-tracker", name: "Suzan DelBene Tracker", description: "Operaciones declaradas por Suzan DelBene (D-WA, Ways and Means), ex ejecutiva de Microsoft con foco en tecnología.", category: "political_us", source: "house_clerk", manager: "Suzan DelBene", country: "US", followers: 5100, return_ytd: 23.1, premium: false, tags: ["congreso", "ways-and-means", "msft"] }),
  p({ id: "d39", slug: "tiger-global", name: "Tiger Global Management", description: "El libro 13F de Tiger Global (Chase Coleman): alta convicción en plataformas tecnológicas, software y semiconductores.", category: "hedge_fund", source: "sec_13f", manager: "Chase Coleman", country: "US", followers: 10200, return_ytd: 33.1, premium: true, tags: ["13f", "tech", "growth", "wall-street"] }),
  p({ id: "d40", slug: "coatue-management", name: "Coatue Management", description: "El libro 13F de Coatue (Philippe Laffont): infraestructura de inteligencia artificial, energía para data centers y TMT.", category: "hedge_fund", source: "sec_13f", manager: "Philippe Laffont", country: "US", followers: 8900, return_ytd: 31.8, premium: true, tags: ["13f", "ia", "semis", "tmt"] }),
  p({ id: "d41", slug: "bridgewater-all-weather", name: "Bridgewater Associates (13F)", description: "El libro 13F de Bridgewater Associates: diversificación macro global, mercados emergentes y consumo defensivo.", category: "hedge_fund", source: "sec_13f", manager: "Ray Dalio / Bridgewater", country: "US", followers: 11600, return_ytd: 14.7, premium: false, tags: ["13f", "macro", "all-weather"] }),
  p({ id: "d42", slug: "renaissance-institutional", name: "Renaissance Technologies (13F)", description: "Posiciones cuantitativas reportadas en el 13F de Renaissance Technologies, el fondo sistemático líder de Wall Street.", category: "hedge_fund", source: "sec_13f", manager: "Jim Simons / Rentech", country: "US", followers: 15300, return_ytd: 28.9, premium: true, tags: ["13f", "quant", "algoritmico"] }),
  p({ id: "d43", slug: "softbank-vision", name: "SoftBank Group (13F)", description: "Posiciones listadas en EE.UU. de SoftBank Group: foco estratégico en diseño de chips, robótica y ecosistema ARM.", category: "hedge_fund", source: "sec_13f", manager: "Masayoshi Son", country: "Global", followers: 8100, return_ytd: 25.4, premium: true, tags: ["13f", "arm", "ia", "japon"] }),
  p({ id: "d44", slug: "mubadala-sovereign", name: "Mubadala Investment Co (13F)", description: "Declaraciones 13F del fondo soberano de Abu Dabi: inversiones estratégicas en semiconductores, IA e infraestructura.", category: "hedge_fund", source: "sec_13f", manager: "Fondo Soberano Abu Dabi", country: "Global", followers: 6200, return_ytd: 18.6, premium: true, tags: ["13f", "soberano", "semis"] }),
  p({ id: "d45", slug: "afp-consenso-chile", name: "Consenso AFP Chile — Acciones Nacionales", description: "Tenencias agregadas de los Fondos de Pensiones chilenos en renta variable local según reportes de la Superintendencia de Pensiones.", category: "public_disclosure", source: "spensiones", manager: "Fondos de Pensiones CL", country: "CL", followers: 8700, return_ytd: 14.2, premium: false, tags: ["chile", "afp", "ipsa", "institucional"] }),
  p({ id: "d46", slug: "cobre-superciclo", name: "Superciclo del Cobre & Red Eléctrica", description: "Productores de cobre y equipamiento de transmisión eléctrica ante el déficit estructural por electrificación y data centers.", category: "thematic", source: "model", manager: "Tesis Commodities", country: "Global", followers: 6900, return_ytd: 29.1, premium: true, tags: ["cobre", "mineria", "chile", "electrificacion"] }),
  p({ id: "d47", slug: "trump-dice", name: "Trump dice", description: "Compra simulada de US$1.000 al cierre cada vez que Donald Trump llama a comprar o elogia directamente una acción. Cada mención con su cita y su fuente.", category: "political_us", source: "trump_mentions", manager: "Donald Trump", country: "US", followers: 0, return_ytd: null, premium: false, tags: ["trump", "menciones", "truth-social", "dichos"] }),
  p({
    id: "d-f10",
    slug: "insiders-compras-1m",
    name: "Compras de ejecutivos",
    description:
      "Compras en mercado abierto (código P) de officers y directores por US$1 millón o más, según el Formulario 4 de la SEC. En el primer semestre de 2026 esta señal no le ganó al SPY (promedio -1,80% contra +8,11%). Simulación histórica con fines informativos. No es recomendación de inversión.",
    category: "public_disclosure",
    source: "sec_form4",
    country: "US",
    followers: 0,
    return_ytd: null,
    premium: false,
    tags: ["insiders", "form4", "sec", "ejecutivos"],
  }),
  p({ id: "d48", slug: "musk-dice", name: "Elon Musk dice", description: "Simulación histórica de los elogios verificados de Elon Musk a acciones de terceros, con la cita y el enlace al post. Tesla se muestra como contexto: Musk es insider y no es una señal.", category: "model", source: "musk_mentions", manager: "Elon Musk", country: "US", followers: 0, return_ytd: null, premium: false, tags: ["musk", "menciones", "x"] }),
];

// Holdings de demostración por portfolio (id -> lista)
const DEMO_HOLDINGS: Record<string, Omit<Holding, "portfolio_id" | "as_of">[]> = {
  "pelosi-tracker": [
    { id: "h1", symbol: "NVDA", name: "NVIDIA Corp", weight: 18.5, previous_weight: 14.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 128.40, price_current: 196.58, return_pct: 53.1 },
    { id: "h2", symbol: "AAPL", name: "Apple Inc", weight: 15.0, previous_weight: 16.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 224.31, price_current: 258.24, return_pct: 15.1 },
    { id: "h3", symbol: "MSFT", name: "Microsoft Corp", weight: 14.0, previous_weight: 14.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 415.28, price_current: 481.90, return_pct: 16.0 },
    { id: "h4", symbol: "GOOGL", name: "Alphabet Inc", weight: 12.0, previous_weight: 10.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 189.67, price_current: 237.42, return_pct: 25.2 },
    { id: "h5", symbol: "AMZN", name: "Amazon.com Inc", weight: 10.5, previous_weight: 11.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 186.44, price_current: 226.73, return_pct: 21.6 },
    { id: "h6", symbol: "TSLA", name: "Tesla Inc", weight: 9.0, previous_weight: 12.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 248.50, price_current: 334.07, return_pct: 34.4 },
    { id: "h7", symbol: "CRM", name: "Salesforce Inc", weight: 8.0, previous_weight: 7.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 254.63, price_current: 288.19, return_pct: 13.2 },
    { id: "h8", symbol: "PANW", name: "Palo Alto Networks", weight: 7.0, previous_weight: 5.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 312.50, price_current: 392.18, return_pct: 25.5 },
    { id: "h9", symbol: "DIS", name: "Walt Disney Co", weight: 6.0, previous_weight: 9.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 101.35, price_current: 112.68, return_pct: 11.2 },
  ],
  "trump-trades": [
    { id: "h10a", symbol: "DJT", name: "Trump Media & Technology", weight: 18.5, previous_weight: 16.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 24.80, price_current: 34.90, return_pct: 40.7 },
    { id: "h10b", symbol: "XOM", name: "Exxon Mobil Corp", weight: 16.0, previous_weight: 14.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 112.40, price_current: 124.85, return_pct: 11.1 },
    { id: "h10c", symbol: "CVX", name: "Chevron Corp", weight: 15.0, previous_weight: 14.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 154.20, price_current: 172.04, return_pct: 11.6 },
    { id: "h10d", symbol: "IBIT", name: "iShares Bitcoin Trust", weight: 14.5, previous_weight: 12.0, asset_class: "etf", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 38.50, price_current: 54.20, return_pct: 40.8 },
    { id: "h10e", symbol: "JPM", name: "JPMorgan Chase & Co", weight: 13.5, previous_weight: 15.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 231.42, price_current: 268.85, return_pct: 16.2 },
    { id: "h10f", symbol: "NUE", name: "Nucor Corp (Acero EE.UU.)", weight: 12.0, previous_weight: 13.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 148.90, price_current: 167.35, return_pct: 12.4 },
    { id: "h10g", symbol: "LMT", name: "Lockheed Martin", weight: 10.5, previous_weight: 15.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 508.25, price_current: 552.44, return_pct: 8.7 },
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
  // --- Wave 3: Trump Truth Radar, DOGE/Musk, Congreso, 13F Elite y Consenso CL ---
  "trump-truth-signals": [
    { id: "h127", symbol: "DJT", name: "Trump Media & Technology", weight: 19.0, previous_weight: 15.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 23.40, price_current: 34.90, return_pct: 49.1 },
    { id: "h128", symbol: "XOM", name: "Exxon Mobil (Energía doméstica)", weight: 16.5, previous_weight: 14.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 110.20, price_current: 124.85, return_pct: 13.3 },
    { id: "h129", symbol: "IBIT", name: "iShares Bitcoin Trust (Reserva Cripto)", weight: 15.0, previous_weight: 11.5, asset_class: "etf", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 36.80, price_current: 54.20, return_pct: 47.3 },
    { id: "h130", symbol: "TSLA", name: "Tesla Inc (Manufactura EE.UU.)", weight: 14.0, previous_weight: 15.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 248.50, price_current: 334.07, return_pct: 34.4 },
    { id: "h131", symbol: "PLTR", name: "Palantir Technologies (Defensa/Frontera)", weight: 13.0, previous_weight: 11.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 36.40, price_current: 61.85, return_pct: 69.9 },
    { id: "h132", symbol: "NUE", name: "Nucor Corp (Aranceles Acero)", weight: 12.0, previous_weight: 16.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 148.90, price_current: 167.35, return_pct: 12.4 },
    { id: "h133", symbol: "GEO", name: "The GEO Group (Infraestructura Federal)", weight: 10.5, previous_weight: 17.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 14.80, price_current: 26.45, return_pct: 78.7 },
  ],
  "elon-doge-tracker": [
    { id: "h134", symbol: "TSLA", name: "Tesla Inc (FSD & Robotaxi)", weight: 22.0, previous_weight: 19.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 238.10, price_current: 334.07, return_pct: 40.3 },
    { id: "h135", symbol: "PLTR", name: "Palantir Technologies (Software Federal)", weight: 18.0, previous_weight: 15.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 36.40, price_current: 61.85, return_pct: 69.9 },
    { id: "h136", symbol: "NVDA", name: "NVIDIA Corp (Clúster xAI Colossus)", weight: 15.0, previous_weight: 15.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 138.21, price_current: 196.58, return_pct: 42.2 },
    { id: "h137", symbol: "RKLB", name: "Rocket Lab USA (Lanzamientos Espaciales)", weight: 13.5, previous_weight: 11.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 11.20, price_current: 22.40, return_pct: 100.0 },
    { id: "h138", symbol: "GOOGL", name: "Alphabet Inc (Waymo / IA)", weight: 12.0, previous_weight: 13.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 189.67, price_current: 237.42, return_pct: 25.2 },
    { id: "h139", symbol: "LDOS", name: "Leidos Holdings (IT Defensa)", weight: 10.5, previous_weight: 13.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 164.20, price_current: 182.90, return_pct: 11.4 },
    { id: "h140", symbol: "BAH", name: "Booz Allen Hamilton (Consultoría Gov)", weight: 9.0, previous_weight: 12.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 158.40, price_current: 146.20, return_pct: -7.7 },
  ],
  "khanna-tracker": [
    { id: "h141", symbol: "MSFT", name: "Microsoft Corp", weight: 18.0, previous_weight: 17.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 415.28, price_current: 481.90, return_pct: 16.0 },
    { id: "h142", symbol: "AAPL", name: "Apple Inc", weight: 16.5, previous_weight: 17.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 224.31, price_current: 258.24, return_pct: 15.1 },
    { id: "h143", symbol: "NVDA", name: "NVIDIA Corp", weight: 15.5, previous_weight: 13.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 138.21, price_current: 196.58, return_pct: 42.2 },
    { id: "h144", symbol: "GOOGL", name: "Alphabet Inc", weight: 14.0, previous_weight: 14.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 189.67, price_current: 237.42, return_pct: 25.2 },
    { id: "h145", symbol: "CRM", name: "Salesforce Inc", weight: 13.0, previous_weight: 13.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 254.63, price_current: 288.19, return_pct: 13.2 },
    { id: "h146", symbol: "AVGO", name: "Broadcom Inc", weight: 12.0, previous_weight: 12.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 168.42, price_current: 212.85, return_pct: 26.4 },
    { id: "h147", symbol: "PANW", name: "Palo Alto Networks", weight: 11.0, previous_weight: 12.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 312.50, price_current: 392.18, return_pct: 25.5 },
  ],
  "delbene-tracker": [
    { id: "h148", symbol: "MSFT", name: "Microsoft Corp", weight: 24.0, previous_weight: 22.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 415.28, price_current: 481.90, return_pct: 16.0 },
    { id: "h149", symbol: "AMZN", name: "Amazon.com Inc", weight: 17.0, previous_weight: 16.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 186.44, price_current: 226.73, return_pct: 21.6 },
    { id: "h150", symbol: "AAPL", name: "Apple Inc", weight: 15.0, previous_weight: 16.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 224.31, price_current: 258.24, return_pct: 15.1 },
    { id: "h151", symbol: "COST", name: "Costco Wholesale", weight: 13.5, previous_weight: 13.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 842.10, price_current: 964.50, return_pct: 14.5 },
    { id: "h152", symbol: "GOOGL", name: "Alphabet Inc", weight: 11.5, previous_weight: 12.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 189.67, price_current: 237.42, return_pct: 25.2 },
    { id: "h153", symbol: "LIN", name: "Linde plc", weight: 10.0, previous_weight: 10.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 448.20, price_current: 486.90, return_pct: 8.6 },
    { id: "h154", symbol: "TMO", name: "Thermo Fisher Scientific", weight: 9.0, previous_weight: 9.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 562.40, price_current: 612.80, return_pct: 9.0 },
  ],
  "tiger-global": [
    { id: "h155", symbol: "META", name: "Meta Platforms", weight: 19.5, previous_weight: 18.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 563.72, price_current: 704.18, return_pct: 24.9 },
    { id: "h156", symbol: "MSFT", name: "Microsoft Corp", weight: 17.5, previous_weight: 17.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 415.28, price_current: 481.90, return_pct: 16.0 },
    { id: "h157", symbol: "APO", name: "Apollo Global Management", weight: 15.0, previous_weight: 14.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 124.50, price_current: 168.40, return_pct: 35.3 },
    { id: "h158", symbol: "AMZN", name: "Amazon.com Inc", weight: 14.0, previous_weight: 14.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 186.44, price_current: 226.73, return_pct: 21.6 },
    { id: "h159", symbol: "NVDA", name: "NVIDIA Corp", weight: 12.5, previous_weight: 11.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 138.21, price_current: 196.58, return_pct: 42.2 },
    { id: "h160", symbol: "TTD", name: "The Trade Desk", weight: 11.5, previous_weight: 13.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 98.40, price_current: 126.80, return_pct: 28.9 },
    { id: "h161", symbol: "SE", name: "Sea Limited", weight: 10.0, previous_weight: 12.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 82.10, price_current: 114.60, return_pct: 39.6 },
  ],
  "coatue-management": [
    { id: "h162", symbol: "NVDA", name: "NVIDIA Corp", weight: 18.5, previous_weight: 16.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 138.21, price_current: 196.58, return_pct: 42.2 },
    { id: "h163", symbol: "TSM", name: "Taiwan Semiconductor", weight: 16.5, previous_weight: 15.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 178.42, price_current: 225.61, return_pct: 26.4 },
    { id: "h164", symbol: "META", name: "Meta Platforms", weight: 15.0, previous_weight: 15.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 563.72, price_current: 704.18, return_pct: 24.9 },
    { id: "h165", symbol: "AMZN", name: "Amazon.com Inc", weight: 14.0, previous_weight: 14.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 186.44, price_current: 226.73, return_pct: 21.6 },
    { id: "h166", symbol: "CEG", name: "Constellation Energy (Nuclear IA)", weight: 13.0, previous_weight: 11.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 218.50, price_current: 289.40, return_pct: 32.4 },
    { id: "h167", symbol: "GEV", name: "GE Vernova (Red Eléctrica)", weight: 12.0, previous_weight: 14.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 242.10, price_current: 338.60, return_pct: 39.9 },
    { id: "h168", symbol: "AMD", name: "Advanced Micro Devices", weight: 11.0, previous_weight: 12.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 163.85, price_current: 194.28, return_pct: 18.6 },
  ],
  "bridgewater-all-weather": [
    { id: "h169", symbol: "IVV", name: "iShares Core S&P 500 ETF", weight: 18.0, previous_weight: 17.5, asset_class: "etf", exchange: "NYSE", currency: "USD", price_at_disclosure: 548.20, price_current: 612.40, return_pct: 11.7 },
    { id: "h170", symbol: "IEMG", name: "iShares Core MSCI Emerging Markets", weight: 16.5, previous_weight: 17.0, asset_class: "etf", exchange: "NYSE", currency: "USD", price_at_disclosure: 53.40, price_current: 59.80, return_pct: 12.0 },
    { id: "h171", symbol: "GOOGL", name: "Alphabet Inc", weight: 15.0, previous_weight: 14.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 189.67, price_current: 237.42, return_pct: 25.2 },
    { id: "h172", symbol: "NVDA", name: "NVIDIA Corp", weight: 14.0, previous_weight: 12.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 138.21, price_current: 196.58, return_pct: 42.2 },
    { id: "h173", symbol: "PG", name: "Procter & Gamble", weight: 13.5, previous_weight: 14.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 168.40, price_current: 179.90, return_pct: 6.8 },
    { id: "h174", symbol: "COST", name: "Costco Wholesale", weight: 12.0, previous_weight: 12.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 842.10, price_current: 964.50, return_pct: 14.5 },
    { id: "h175", symbol: "JNJ", name: "Johnson & Johnson", weight: 11.0, previous_weight: 12.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 158.90, price_current: 166.40, return_pct: 4.7 },
  ],
  "renaissance-institutional": [
    { id: "h176", symbol: "NVO", name: "Novo Nordisk ADR", weight: 18.0, previous_weight: 16.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 118.40, price_current: 134.20, return_pct: 13.3 },
    { id: "h177", symbol: "PLTR", name: "Palantir Technologies", weight: 16.5, previous_weight: 14.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 36.40, price_current: 61.85, return_pct: 69.9 },
    { id: "h178", symbol: "VRTX", name: "Vertex Pharmaceuticals", weight: 15.0, previous_weight: 15.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 468.20, price_current: 518.90, return_pct: 10.8 },
    { id: "h179", symbol: "META", name: "Meta Platforms", weight: 14.0, previous_weight: 14.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 563.72, price_current: 704.18, return_pct: 24.9 },
    { id: "h180", symbol: "PDD", name: "PDD Holdings", weight: 13.5, previous_weight: 15.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 112.50, price_current: 138.40, return_pct: 23.0 },
    { id: "h181", symbol: "AVGO", name: "Broadcom Inc", weight: 12.0, previous_weight: 12.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 168.42, price_current: 212.85, return_pct: 26.4 },
    { id: "h182", symbol: "GILD", name: "Gilead Sciences", weight: 11.0, previous_weight: 12.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 78.40, price_current: 94.60, return_pct: 20.7 },
  ],
  "softbank-vision": [
    { id: "h183", symbol: "ARM", name: "Arm Holdings plc", weight: 28.0, previous_weight: 25.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 126.40, price_current: 168.90, return_pct: 33.6 },
    { id: "h184", symbol: "NVDA", name: "NVIDIA Corp", weight: 17.0, previous_weight: 15.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 138.21, price_current: 196.58, return_pct: 42.2 },
    { id: "h185", symbol: "TSM", name: "Taiwan Semiconductor", weight: 14.5, previous_weight: 15.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 178.42, price_current: 225.61, return_pct: 26.4 },
    { id: "h186", symbol: "TMUS", name: "T-Mobile US", weight: 12.5, previous_weight: 14.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 196.80, price_current: 234.50, return_pct: 19.2 },
    { id: "h187", symbol: "CPNG", name: "Coupang Inc", weight: 10.5, previous_weight: 11.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 26.24, price_current: 31.84, return_pct: 21.3 },
    { id: "h188", symbol: "SYM", name: "Symbotic Inc (Robótica Almacenes)", weight: 9.5, previous_weight: 10.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 28.40, price_current: 35.10, return_pct: 23.6 },
    { id: "h189", symbol: "IONQ", name: "IonQ Inc (Cómputo Cuántico)", weight: 8.0, previous_weight: 8.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 14.20, price_current: 24.80, return_pct: 74.6 },
  ],
  "mubadala-sovereign": [
    { id: "h190", symbol: "AMD", name: "Advanced Micro Devices", weight: 21.0, previous_weight: 19.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 163.85, price_current: 194.28, return_pct: 18.6 },
    { id: "h191", symbol: "GFS", name: "GlobalFoundries Inc", weight: 17.5, previous_weight: 19.0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 44.20, price_current: 49.80, return_pct: 12.7 },
    { id: "h192", symbol: "NVDA", name: "NVIDIA Corp", weight: 15.0, previous_weight: 13.5, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 138.21, price_current: 196.58, return_pct: 42.2 },
    { id: "h193", symbol: "IBIT", name: "iShares Bitcoin Trust", weight: 13.5, previous_weight: 11.5, asset_class: "etf", exchange: "NASDAQ", currency: "USD", price_at_disclosure: 38.50, price_current: 54.20, return_pct: 40.8 },
    { id: "h194", symbol: "TSM", name: "Taiwan Semiconductor", weight: 12.0, previous_weight: 13.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 178.42, price_current: 225.61, return_pct: 26.4 },
    { id: "h195", symbol: "ALB", name: "Albemarle Corp", weight: 11.0, previous_weight: 12.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 96.40, price_current: 112.30, return_pct: 16.5 },
    { id: "h196", symbol: "SNOW", name: "Snowflake Inc", weight: 10.0, previous_weight: 11.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 134.80, price_current: 168.40, return_pct: 24.9 },
  ],
  "afp-consenso-chile": [
    { id: "h197", symbol: "SQM-B", name: "Sociedad Química y Minera de Chile", weight: 18.5, previous_weight: 17.2, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: 38400, price_current: 43250, return_pct: 12.6 },
    { id: "h198", symbol: "BSANTANDER", name: "Banco Santander Chile", weight: 16.5, previous_weight: 16.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: 46.80, price_current: 53.90, return_pct: 15.2 },
    { id: "h199", symbol: "CHILE", name: "Banco de Chile", weight: 15.0, previous_weight: 15.5, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: 108.50, price_current: 124.20, return_pct: 14.5 },
    { id: "h200", symbol: "COPEC", name: "Empresas Copec S.A.", weight: 14.0, previous_weight: 14.8, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: 6420, price_current: 7180, return_pct: 11.8 },
    { id: "h201", symbol: "FALABELLA", name: "Falabella S.A.", weight: 13.0, previous_weight: 11.5, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: 2890, price_current: 3540, return_pct: 22.5 },
    { id: "h202", symbol: "ENELAM", name: "Enel Américas S.A.", weight: 12.0, previous_weight: 13.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: 92.40, price_current: 101.80, return_pct: 10.2 },
    { id: "h203", symbol: "CENCOSUD", name: "Cencosud S.A.", weight: 11.0, previous_weight: 12.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: 1780, price_current: 2045, return_pct: 14.9 },
  ],
  "cobre-superciclo": [
    { id: "h204", symbol: "FCX", name: "Freeport-McMoRan Inc", weight: 20.0, previous_weight: 18.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 42.80, price_current: 54.60, return_pct: 27.6 },
    { id: "h205", symbol: "SCCO", name: "Southern Copper Corp", weight: 17.5, previous_weight: 16.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 98.40, price_current: 126.80, return_pct: 28.9 },
    { id: "h206", symbol: "ANTO", name: "Antofagasta plc (Grupo Luksic)", weight: 15.5, previous_weight: 16.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 22.40, price_current: 28.90, return_pct: 29.0 },
    { id: "h207", symbol: "TECK", name: "Teck Resources (Quebrada Blanca II)", weight: 14.0, previous_weight: 14.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 46.20, price_current: 58.40, return_pct: 26.4 },
    { id: "h208", symbol: "PWR", name: "Quanta Services (Transmisión Eléctrica)", weight: 12.5, previous_weight: 12.0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 268.50, price_current: 342.10, return_pct: 27.4 },
    { id: "h209", symbol: "ETN", name: "Eaton Corp (Equipos de Red)", weight: 11.0, previous_weight: 11.5, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: 312.40, price_current: 378.90, return_pct: 21.3 },
    { id: "h210", symbol: "SQM-B", name: "SQM S.A. (Litio & Electromovilidad)", weight: 9.5, previous_weight: 11.0, asset_class: "equity", exchange: "BCS", currency: "CLP", price_at_disclosure: 38400, price_current: 43250, return_pct: 12.6 },
  ],
  // Pesos de la semilla 014 al 16-10-2026. previous_weight null: en demo no
  // simulamos un salto; en la base real previous_weight = 0 dispara new_trade.
  "trump-dice": [
    { id: "h211", symbol: "DELL", name: "Dell Technologies", weight: 39.18, previous_weight: null, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h212", symbol: "INTC", name: "Intel", weight: 26.73, previous_weight: null, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h213", symbol: "MU", name: "Micron Technology", weight: 8.84, previous_weight: null, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h214", symbol: "AAPL", name: "Apple", weight: 5.63, previous_weight: null, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h215", symbol: "TSLA", name: "Tesla", weight: 5.52, previous_weight: null, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h216", symbol: "PLTR", name: "Palantir Technologies", weight: 5.22, previous_weight: null, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h217", symbol: "SPY", name: "SPDR S&P 500 ETF", weight: 5.08, previous_weight: null, asset_class: "etf", exchange: "NYSE", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h218", symbol: "USD-CASH", name: "Efectivo (U.S. Steel, compra de Nippon a US$55)", weight: 3.8, previous_weight: null, asset_class: "cash", exchange: null, currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
  ],
  "insiders-compras-1m": [
    { id: "h-f10-1", symbol: "TTD", name: "TTD", weight: 33.34, previous_weight: 0, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h-f10-2", symbol: "KKR", name: "KKR", weight: 33.33, previous_weight: 0, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h-f10-3", symbol: "MSCI", name: "MSCI", weight: 33.33, previous_weight: 33.33, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
  ],
  // Semilla 017. previous_weight null: en demo no hay salto. CDR y Tesla no son holdings.
  "musk-dice": [
    { id: "h219", symbol: "ETSY", name: "Etsy", weight: 50, previous_weight: null, asset_class: "equity", exchange: "NASDAQ", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
    { id: "h220", symbol: "GME", name: "GameStop", weight: 50, previous_weight: null, asset_class: "equity", exchange: "NYSE", currency: "USD", price_at_disclosure: null, price_current: null, return_pct: null },
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
  { id: "a1", portfolio_id: "d1", type: "new_trade", severity: "high", title: "Nancy Pelosi compró $1M–$5M en NVDA", summary: "La congresista Pelosi realizó una compra significativa de NVIDIA vía opciones call deep-in-the-money con vencimiento 2027, su tercera operación en semiconductores este trimestre.", payload: { symbol: "NVDA", tx_date: "2026-10-01", disclosed: "2026-10-09", traded_at: "2026-10-01", filed_at: "2026-10-09" }, created_at: "2026-10-09T14:00:00Z", portfolio: { id: "d1", slug: "pelosi-tracker", name: "Pelosi Tracker" } },
  { id: "a-f10-1", portfolio_id: "d-f10", type: "new_trade", severity: "high", title: "Insider: Chief Executive Officer de TTD compró US$148.101.266", summary: null, payload: { symbol: "TTD", owner_name: "Jeff Green", owner_title: "Chief Executive Officer", value_usd: 148101266, trans_date: "2026-03-02", filed_at: "2026-03-04", source_url: "https://www.sec.gov/Archives/edgar/data/1671933/000167144526000004/wk-form4_1772674051.xml" }, created_at: "2026-03-04T21:00:00Z", portfolio: { id: "d47", slug: "insiders-compras-1m", name: "Compras de ejecutivos" } },
  { id: "a11", portfolio_id: "d35", type: "mention", severity: "high", title: "Trump en Truth Social: impulso a perforación en EE.UU. (XOM, CVX)", summary: "Donald Trump publicó en Truth Social un llamado directo a acelerar permisos federales de perforación y gas natural licuado ('DRILL, BABY, DRILL'), destacando a las integradas energéticas estadounidenses Exxon Mobil (XOM) y Chevron (CVX) como pilares para reducir costos industriales.", payload: { symbol: "XOM", filed_at: "2026-10-10", traded_at: "2026-10-10" }, created_at: "2026-10-10T11:30:00Z", portfolio: { id: "d35", slug: "trump-truth-signals", name: "Trump Truth & Tariffs Radar" } },
  { id: "a12", portfolio_id: "d2", type: "mention", severity: "high", title: "Trump ratifica tesis de Reserva Estratégica de Bitcoin (IBIT, COIN)", summary: "En declaración pública amplificada en Truth Social, Trump reiteró su compromiso de posicionar a EE.UU. como capital mundial cripto y mantener activos digitales en reserva estratégica, impulsando flujos institucionales hacia IBIT (+3.5pp en el radar).", payload: { symbol: "IBIT", filed_at: "2026-10-09", traded_at: "2026-10-09" }, created_at: "2026-10-09T18:15:00Z", portfolio: { id: "d2", slug: "trump-trades", name: "Trump Trades" } },
  { id: "a13", portfolio_id: "d35", type: "mention", severity: "high", title: "Amenaza de aranceles del 25% al acero importado impulsa a Nucor (NUE)", summary: "Trump anunció revisión inmediata de cuotas de importación de acero extranjero para proteger acerías locales. Nucor Corp (NUE) y productores domésticos registraron fuerte rotación compradora tras el comunicado.", payload: { symbol: "NUE", filed_at: "2026-10-09", traded_at: "2026-10-08" }, created_at: "2026-10-09T09:45:00Z", portfolio: { id: "d35", slug: "trump-truth-signals", name: "Trump Truth & Tariffs Radar" } },
  { id: "a14", portfolio_id: "d36", type: "mention", severity: "high", title: "Elon Musk destaca automatización federal con IA (PLTR, TSLA)", summary: "Desde la comisión de eficiencia gubernamental (DOGE), Elon Musk señaló la consolidación de sistemas de datos federales sobre plataformas de software comercial e IA, catapultando a Palantir (PLTR) al 18.0% del portafolio temático mientras consultoras tradicionales (BAH) retroceden.", payload: { symbol: "PLTR", filed_at: "2026-10-08", traded_at: "2026-10-08" }, created_at: "2026-10-08T19:20:00Z", portfolio: { id: "d36", slug: "elon-doge-tracker", name: "DOGE & Musk Ecosystem" } },
  { id: "a2", portfolio_id: "d1", type: "weight_change", severity: "medium", title: "TSLA: -3.0pp (ahora 9.0%)", summary: "Redujo su posición en Tesla en 3 puntos porcentuales tras la toma de utilidades trimestral reportada ante el Clerk de la Cámara.", payload: { symbol: "TSLA", tx_date: "2026-09-28", disclosed: "2026-10-08", traded_at: "2026-09-28", filed_at: "2026-10-08" }, created_at: "2026-10-08T10:00:00Z", portfolio: { id: "d1", slug: "pelosi-tracker", name: "Pelosi Tracker" } },
  { id: "a15", portfolio_id: "d1", type: "new_trade", severity: "high", title: "Pelosi ejerció calls de Palo Alto Networks (PANW) por $500K–$1M", summary: "Nuevo formulario PTR confirma que Paul y Nancy Pelosi ejercieron 50 contratos de opciones call sobre Palo Alto Networks (PANW), elevando su ponderación a 7.0% en medio del aumento del gasto federal en ciberseguridad.", payload: { symbol: "PANW", filed_at: "2026-10-07", traded_at: "2026-09-26" }, created_at: "2026-10-07T17:40:00Z", portfolio: { id: "d1", slug: "pelosi-tracker", name: "Pelosi Tracker" } },
  { id: "a3", portfolio_id: "d7", type: "threshold", severity: "high", title: "NVDA superó el 20% del portafolio", summary: "El peso de NVIDIA en AI World War III cruzó el umbral del 20% tras la revalorización semanal impulsada por la demanda de chips Blackwell.", payload: { symbol: "NVDA", filed_at: "2026-10-07", traded_at: "2026-10-07" }, created_at: "2026-10-07T16:00:00Z", portfolio: { id: "d7", slug: "ai-world-war", name: "AI World War III" } },
  { id: "a16", portfolio_id: "d40", type: "13f_update", severity: "high", title: "Coatue refuerza tesis de energía nuclear para IA con CEG y GEV", summary: "El último filing 13F de Philippe Laffont revela un incremento agresivo en Constellation Energy (CEG, 13.0%) y GE Vernova (GEV, 12.0%), apostando al cuello de botella eléctrico de los hiperescaladores.", payload: { symbol: "CEG", filed_at: "2026-10-06", traded_at: "2026-09-30" }, created_at: "2026-10-06T18:30:00Z", portfolio: { id: "d40", slug: "coatue-management", name: "Coatue Management" } },
  { id: "a10", portfolio_id: "d34", type: "weight_change", severity: "low", title: "BTG Cartera Concentrada: mantención mensual en LTM y FALABELLA", summary: "La cartera recomendada de BTG Pactual mantiene sus siete acciones IPSA en pesos iguales (14.3%), destacando el retorno acumulado de +20.2% en LATAM Airlines (LTM) y +15.1% en Falabella.", payload: { symbol: "LTM", filed_at: "2026-10-06", traded_at: "2026-10-06" }, created_at: "2026-10-06T12:00:00Z", portfolio: { id: "d34", slug: "btg-cartera-recomendada", name: "BTG Pactual — Cartera Recomendada 5" } },
  { id: "a4", portfolio_id: "d3", type: "weight_change", severity: "low", title: "Renta 4 Moderada: ajuste mensual de COPEC", summary: "Renta 4 subió COPEC a 16% en su cartera moderada de octubre, citando valorización atractiva y mejora en márgenes de celulosa.", payload: { symbol: "COPEC", filed_at: "2026-10-06", traded_at: "2026-10-05" }, created_at: "2026-10-06T09:00:00Z", portfolio: { id: "d3", slug: "renta4-moderada", name: "Renta 4 — Cartera Moderada" } },
  { id: "a17", portfolio_id: "d45", type: "weight_change", severity: "medium", title: "Consenso AFP Chile: compras netas en SQM-B y FALABELLA", summary: "El reporte mensual de inversiones de la Superintendencia de Pensiones muestra que los Multifondos A y B incrementaron su tenencia en SQM-B (+1.3pp hasta 18.5%) y Falabella (+1.5pp hasta 13.0%).", payload: { symbol: "SQM-B", filed_at: "2026-10-05", traded_at: "2026-09-30" }, created_at: "2026-10-05T16:10:00Z", portfolio: { id: "d45", slug: "afp-consenso-chile", name: "Consenso AFP Chile — Acciones Nacionales" } },
  { id: "a8", portfolio_id: "d30", type: "new_trade", severity: "medium", title: "Gottheimer compró NVDA y JPM", summary: "Josh Gottheimer reportó compras de NVIDIA y JPMorgan en el rango $15K–$50K, alineadas con su foco en el comité de Servicios Financieros.", payload: { symbol: "NVDA", tx_date: "2026-09-22", disclosed: "2026-10-05", traded_at: "2026-09-22", filed_at: "2026-10-05" }, created_at: "2026-10-05T12:00:00Z", portfolio: { id: "d30", slug: "gottheimer-tracker", name: "Josh Gottheimer Tracker" } },
  { id: "a18", portfolio_id: "d37", type: "new_trade", severity: "medium", title: "Ro Khanna declaró compras en NVDA y MSFT", summary: "El representante de Silicon Valley reportó nuevas adquisiciones familiares en NVIDIA (+2.0pp) y Microsoft (+1.0pp), consolidando más del 60% de su cartera en megacaps tecnológicas.", payload: { symbol: "NVDA", filed_at: "2026-10-04", traded_at: "2026-09-25" }, created_at: "2026-10-04T15:30:00Z", portfolio: { id: "d37", slug: "khanna-tracker", name: "Ro Khanna Tracker" } },
  { id: "a9", portfolio_id: "d31", type: "new_trade", severity: "medium", title: "Tuberville compró opciones sobre NVDA y acciones de Boeing (BA)", summary: "El senador Tuberville declaró compras de calls de NVIDIA y sumó exposición a Boeing (BA, 11.4%), manteniendo su intensa actividad en el comité de Servicios Armados.", payload: { symbol: "BA", tx_date: "2026-09-24", disclosed: "2026-10-04", traded_at: "2026-09-24", filed_at: "2026-10-04" }, created_at: "2026-10-04T12:00:00Z", portfolio: { id: "d31", slug: "tuberville-tracker", name: "Tommy Tuberville Tracker" } },
  { id: "a5", portfolio_id: "d23", type: "13f_update", severity: "medium", title: "13F Q3: Berkshire recortó AAPL y subió OXY y CB", summary: "El filing trimestral de Warren Buffett muestra una reducción de Apple a 23.4% del libro, compensada con aumentos en Occidental Petroleum (OXY) y la aseguradora Chubb (CB).", payload: { symbol: "OXY", filed_at: "2026-10-03", traded_at: "2026-09-30" }, created_at: "2026-10-03T20:00:00Z", portfolio: { id: "d23", slug: "berkshire-hathaway", name: "Berkshire Hathaway" } },
  { id: "a19", portfolio_id: "d39", type: "13f_update", severity: "high", title: "Tiger Global eleva META al 19.5% y suma Apollo (APO)", summary: "Chase Coleman concentró casi el 37% de su cartera 13F entre Meta Platforms y Microsoft, agregando convicción en crédito privado vía Apollo Global Management (15.0%).", payload: { symbol: "META", filed_at: "2026-10-03", traded_at: "2026-09-30" }, created_at: "2026-10-03T14:20:00Z", portfolio: { id: "d39", slug: "tiger-global", name: "Tiger Global Management" } },
  { id: "a6", portfolio_id: "d25", type: "13f_update", severity: "high", title: "Druckenmiller entró a NTRA con 16,8% del libro", summary: "Duquesne Family Office abrió una posición dominante en Natera (NTRA, +43.8% desde el filing) y aumentó Coherent Corp (COHR), manteniendo su sesgo hacia biotecnología de precisión e IA óptica.", payload: { symbol: "NTRA", filed_at: "2026-10-02", traded_at: "2026-09-30" }, created_at: "2026-10-02T20:00:00Z", portfolio: { id: "d25", slug: "duquesne-family-office", name: "Duquesne Family Office" } },
  { id: "a20", portfolio_id: "d42", type: "13f_update", severity: "medium", title: "Renaissance Technologies sobrepondera Novo Nordisk (NVO) y Palantir (PLTR)", summary: "Los modelos cuantitativos de Rentech incrementaron su posición en Novo Nordisk (18.0%) y Palantir (16.5%) en el cierre trimestral.", payload: { symbol: "NVO", filed_at: "2026-10-02", traded_at: "2026-09-30" }, created_at: "2026-10-02T11:45:00Z", portfolio: { id: "d42", slug: "renaissance-institutional", name: "Renaissance Technologies (13F)" } },
  { id: "a7", portfolio_id: "d26", type: "13f_update", severity: "medium", title: "Scion sumó BABA hasta 19,8% del portafolio", summary: "Michael Burry aumentó la exposición a China vía Alibaba y JD.com, su apuesta contrarian de valor más grande del año con un retorno acumulado superior al 30% desde el reporte.", payload: { symbol: "BABA", filed_at: "2026-10-01", traded_at: "2026-09-30" }, created_at: "2026-10-01T20:00:00Z", portfolio: { id: "d26", slug: "scion-asset-management", name: "Scion Asset Management" } },
  { id: "a21", portfolio_id: "d43", type: "13f_update", severity: "high", title: "SoftBank concentra 45% de su libro EE.UU. en ARM y NVDA", summary: "Masayoshi Son redobló la apuesta de SoftBank en arquitectura de semiconductores para IA, elevando Arm Holdings al 28.0% y NVIDIA al 17.0%.", payload: { symbol: "ARM", filed_at: "2026-10-01", traded_at: "2026-09-30" }, created_at: "2026-10-01T15:00:00Z", portfolio: { id: "d43", slug: "softbank-vision", name: "SoftBank Group (13F)" } },
  { id: "a22", portfolio_id: "d44", type: "13f_update", severity: "medium", title: "Fondo Soberano Mubadala declara posición de 13,5% en IBIT y 21% en AMD", summary: "El brazo inversor de Abu Dabi reveló en su 13F una asignación institucional récord en el ETF de Bitcoin de BlackRock (IBIT) junto con su participación estratégica en AMD y GlobalFoundries.", payload: { symbol: "IBIT", filed_at: "2026-09-30", traded_at: "2026-09-30" }, created_at: "2026-09-30T18:00:00Z", portfolio: { id: "d44", slug: "mubadala-sovereign", name: "Mubadala Investment Co (13F)" } },
  { id: "a23", portfolio_id: "d46", type: "weight_change", severity: "medium", title: "Superciclo del Cobre: Freeport-McMoRan (FCX) sube a 20% por déficit de red", summary: "La cartera temática aumentó exposición a productoras de cobre con operaciones en Chile y Perú (FCX, SCCO, ANTO) ante la proyección de demanda eléctrica de centros de datos.", payload: { symbol: "FCX", filed_at: "2026-09-29", traded_at: "2026-09-29" }, created_at: "2026-09-29T13:15:00Z", portfolio: { id: "d46", slug: "cobre-superciclo", name: "Superciclo del Cobre & Red Eléctrica" } },
  { id: "a24", portfolio_id: "d2", type: "mention", severity: "high", title: "Trump destaca a Palantir (PLTR) y Tesla (TSLA) en cumbre manufacturera", summary: "Mención directa a la relocalización industrial y contratos de defensa tecnológica en EE.UU., gatillando alertas de flujo en acciones del ecosistema industrial-tecnológico.", payload: { symbol: "DJT", filed_at: "2026-09-28", traded_at: "2026-09-28" }, created_at: "2026-09-28T17:00:00Z", portfolio: { id: "d2", slug: "trump-trades", name: "Trump Trades" } },
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
