/**
 * mentions-queries.ts — Menciones verificadas de un portafolio (F8, Trump dice).
 * No reemplaza a queries.ts.
 *
 * Lógica pura (Vitest, sin red):
 *  - shortQuote, mentionKindLabel, formatMentionDate
 *  - primarySourceUrl, selectVerifiedMentions
 * Acceso:
 *  - getMentions: public.mentions con status verificada, o el respaldo demo
 *    (Trump 15, Musk 4, Cramer 27) si Supabase no está configurado.
 */

import { createClient } from "@/lib/supabase/server";

export interface MentionRow {
  id: string;
  saidAt: string;
  entryDate: string;
  symbol: string;
  company: string | null;
  kind: string | null;
  quote: string;
  sourceUrls: string[];
  status: string;
  externalId: string | null;
}

export interface PublicMention {
  id: string;
  saidAt: string;
  entryDate: string;
  symbol: string;
  company: string | null;
  kind: string | null;
  quote: string;
  /** Primera URL http(s) de la fila. */
  sourceUrl: string;
  externalId: string | null;
}

export interface MentionsList {
  mentions: PublicMention[];
  /** True cuando los datos vienen del respaldo ilustrativo (sin Supabase). */
  isDemo: boolean;
}

const KIND_LABELS: Record<string, string> = {
  compra_directa: "Compra directa",
  compra_directa_mercado: "Compra del mercado",
  elogio: "Elogio",
  elogio_accion: "Elogio a la acción",
  elogio_con_ticker: "Elogio con ticker",
  elogio_producto: "Elogio al producto",
  elogio_acuerdo: "Elogio al acuerdo",
  recomienda_compra: "Recomienda compra",
  recomienda_venta: "Recomienda venta",
  critica: "Crítica",
  empresa_propia: "Empresa propia",
};

/** Aviso de la ficha musk-dice. Esas menciones se ven, pero no son señal. */
export const MUSK_INSIDER_NOTICE =
  "Musk es insider de Tesla/SpaceX/xAI; esas menciones no son señal.";

const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

const HTTP_URL = /^https?:\/\//i;
const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/** Misma regla que queries.ts: sin URL real, el sitio está en modo demo. */
function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

/** Frase corta para la lista. No pasa de `max` caracteres (incluye el elipsis). */
export function shortQuote(quote: string, max = 80): string {
  const clean = quote.replace(/\s+/g, " ").trim();
  if (max < 1) return "";
  if (clean.length <= max) return clean;
  if (max === 1) return "…";
  const room = max - 1;
  let cut = clean.slice(0, room);
  const space = cut.lastIndexOf(" ");
  if (space >= Math.floor(room * 0.6)) cut = cut.slice(0, space);
  const trimmed = cut.replace(/[\s.,;:]+$/u, "");
  return (trimmed || clean.slice(0, room)) + "…";
}

export function mentionKindLabel(kind: string | null): string {
  if (!kind) return "Mención";
  return KIND_LABELS[kind] ?? "Mención";
}

/**
 * Lado de Reclu frente a un pick de Cramer.
 * recomienda_compra → corto. recomienda_venta → compra. Otro kind → null.
 */
export function recluActionLabel(kind: string | null, symbol: string): string | null {
  const ticker = symbol.trim().toUpperCase();
  if (!ticker) return null;
  if (kind === "recomienda_compra") return `Corto ${ticker}`;
  if (kind === "recomienda_venta") return `Compra ${ticker}`;
  return null;
}

/** Fecha de calendario del texto ISO (no depende de la zona del servidor). */
export function formatMentionDate(iso: string): string {
  const match = DATE_PREFIX.exec(iso.trim());
  if (!match) return iso.trim();
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return iso.trim();
  return `${Number(match[3])} ${month} ${match[1]}`;
}

/** Primera URL http(s). El resto de esquemas no se enlaza. */
export function primarySourceUrl(urls: readonly string[]): string | null {
  for (const url of urls) {
    const trimmed = url.trim();
    if (HTTP_URL.test(trimmed)) return trimmed;
  }
  return null;
}

/**
 * Deja solo dichos verificados con cita, ticker y al menos una fuente http(s).
 * Orden: más reciente primero. No muta la entrada.
 */
export function selectVerifiedMentions(rows: readonly MentionRow[]): PublicMention[] {
  const out: PublicMention[] = [];
  for (const row of rows) {
    if (row.status !== "verificada") continue;
    const quote = row.quote.replace(/\s+/g, " ").trim();
    const symbol = row.symbol.trim().toUpperCase();
    const sourceUrl = primarySourceUrl(row.sourceUrls);
    const saidAt = row.saidAt.trim();
    if (!quote || !symbol || !sourceUrl || !saidAt) continue;
    out.push({
      id: row.id || row.externalId || `${symbol}-${saidAt}`,
      saidAt,
      entryDate: row.entryDate,
      symbol,
      company: row.company,
      kind: row.kind,
      quote,
      sourceUrl,
      externalId: row.externalId,
    });
  }
  return out.toSorted((a, b) => {
    if (a.saidAt !== b.saidAt) return a.saidAt < b.saidAt ? 1 : -1;
    return a.symbol.localeCompare(b.symbol);
  });
}

/**
 * Las 15 menciones verificadas de la migración 014 (fuente: menciones.json).
 * Respaldo cuando no hay Supabase. No agrega dichos sin URL.
 */
const DEMO_TRUMP_MENTIONS: readonly MentionRow[] = [
  {
    id: "demo-m01",
    saidAt: "2025-03-10T21:00+00:00",
    entryDate: "2025-03-11",
    symbol: "TSLA",
    company: "Tesla",
    kind: "compra_directa",
    quote:
      'Anunció que compraría "a brand new Tesla" como "a show of confidence and support" a Elon Musk.',
    sourceUrls: ["https://www.politico.com/news/2025/03/11/trump-buying-tesla-support-elon-musk-00223293"],
    status: "verificada",
    externalId: "M01",
  },
  {
    id: "demo-m02",
    saidAt: "2025-04-09T13:37+00:00",
    entryDate: "2025-04-09",
    symbol: "SPY",
    company: "Mercado (S&P 500)",
    kind: "compra_directa_mercado",
    quote: "THIS IS A GREAT TIME TO BUY!!! DJT",
    sourceUrls: [
      "https://truthsocial.com/@realDonaldTrump/posts/114308272725981913",
      "https://apnews.com/article/trump-truth-social-djt-tesla-musk-tariffs-pause-fccfa6b06c8f1ec0cd7844641ca52669",
    ],
    status: "verificada",
    externalId: "M02",
  },
  {
    id: "demo-m03",
    saidAt: "2025-05-23T16:00+00:00",
    entryDate: "2025-05-23",
    symbol: "X",
    company: "United States Steel",
    kind: "elogio_acuerdo",
    quote:
      '"I am proud to announce that, after much consideration and negotiation, U.S. Steel will remain in America..." (sociedad con Nippon Steel). La acción subió 21% ese día.',
    sourceUrls: [
      "https://www.trumpstruth.org/statuses/31222",
      "https://www.reuters.com/markets/deals/us-steel-remain-america-form-partnership-with-nippon-trump-says-2025-05-23/",
    ],
    status: "verificada",
    externalId: "M03",
  },
  {
    id: "demo-m04",
    saidAt: "2025-08-06T19:00+00:00",
    entryDate: "2025-08-07",
    symbol: "AAPL",
    company: "Apple",
    kind: "elogio",
    quote: 'Llamó a Tim Cook "a great legend" y celebró la inversión de US$600.000 millones de Apple en EE.UU.',
    sourceUrls: ["https://www.hudson-labs.com/research/trump-praised-companies"],
    status: "verificada",
    externalId: "M04",
  },
  {
    id: "demo-m05",
    saidAt: "2025-08-22T21:04+00:00",
    entryDate: "2025-08-25",
    symbol: "INTC",
    company: "Intel",
    kind: "elogio",
    quote:
      '"It is my Great Honor to report that the United States of America now fully owns and controls 10% of INTEL, a Great American Company that has an even more incredible future."',
    sourceUrls: [
      "https://trumpstruth.org/statuses/32698",
      "https://www.presidency.ucsb.edu/documents/truth-social-posts-august-22-2025",
    ],
    status: "verificada",
    externalId: "M05",
  },
  {
    id: "demo-m06",
    saidAt: "2025-12-10T16:00+00:00",
    entryDate: "2025-12-10",
    symbol: "DELL",
    company: "Dell Technologies",
    kind: "elogio_producto",
    quote: 'Dijo que Dell "make[s] a great product" al agradecer a Michael y Susan Dell.',
    sourceUrls: ["https://www.hudson-labs.com/research/trump-praised-companies"],
    status: "verificada",
    externalId: "M06",
  },
  {
    id: "demo-m07",
    saidAt: "2026-01-08T22:00+00:00",
    entryDate: "2026-01-09",
    symbol: "INTC",
    company: "Intel",
    kind: "elogio",
    quote:
      '"The United States Government is proud to be a Shareholder of Intel, and has already made... Tens of Billions of Dollars for the American People — IN JUST FOUR MONTHS."',
    sourceUrls: [
      "https://www.trumpstruth.org/statuses/34489",
      "https://www.cnbc.com/2026/01/08/intel-stock-rises-after-trump-touts-ceo-government-investment.html",
    ],
    status: "verificada",
    externalId: "M07",
  },
  {
    id: "demo-m08",
    saidAt: "2026-02-19T16:00+00:00",
    entryDate: "2026-02-19",
    symbol: "DELL",
    company: "Dell Technologies",
    kind: "compra_directa",
    quote: '"Go out and buy a Dell computer."',
    sourceUrls: [
      "https://www.hudson-labs.com/research/trump-praised-companies",
      "https://finance.yahoo.com/markets/stocks/articles/trump-keeps-telling-americans-buy-235000210.html",
    ],
    status: "verificada",
    externalId: "M08",
  },
  {
    id: "demo-m09",
    saidAt: "2026-03-26T19:00+00:00",
    entryDate: "2026-03-27",
    symbol: "MU",
    company: "Micron Technology",
    kind: "elogio",
    quote: 'Describió a Micron como una de las empresas "hottest" de EE.UU. tras reunirse con su CEO.',
    sourceUrls: [
      "https://stocktwits.com/news-articles/markets/equity/micron-stock-extends-slide-despite-hottest-company-nod-from-trump/cZ3uzd4RIlt",
    ],
    status: "verificada",
    externalId: "M09",
  },
  {
    id: "demo-m10",
    saidAt: "2026-04-10T14:32+00:00",
    entryDate: "2026-04-10",
    symbol: "PLTR",
    company: "Palantir Technologies",
    kind: "elogio_con_ticker",
    quote:
      '"Palantir Technologies (PLTR) has proven to have great war fighting capabilities and equipment. Just ask our enemies!!!"',
    sourceUrls: [
      "https://truthsocial.com/@realDonaldTrump/posts/116380894672815869",
      "https://trumpstruth.org/statuses/37688",
    ],
    status: "verificada",
    externalId: "M10",
  },
  {
    id: "demo-m11",
    saidAt: "2026-04-29T22:20+00:00",
    entryDate: "2026-04-30",
    symbol: "INTC",
    company: "Intel",
    kind: "elogio_accion",
    quote:
      '"Intel Stock continues to rise. I\'m very proud of that Company... Congratulations to Intel on doing such a great job."',
    sourceUrls: ["https://trumpstruth.org/statuses/38092"],
    status: "verificada",
    externalId: "M11",
  },
  {
    id: "demo-m12",
    saidAt: "2026-05-08T16:00+00:00",
    entryDate: "2026-05-08",
    symbol: "DELL",
    company: "Dell Technologies",
    kind: "compra_directa",
    quote: '"Go out and buy a Dell. They\'re great." (la acción marcó máximo histórico ese día)',
    sourceUrls: [
      "https://finance.yahoo.com/markets/stocks/articles/trump-urged-buy-dell-while-101500656.html",
    ],
    status: "verificada",
    externalId: "M12",
  },
  {
    id: "demo-m13",
    saidAt: "2026-07-06T13:30+00:00",
    entryDate: "2026-07-06",
    symbol: "DELL",
    company: "Dell Technologies",
    kind: "compra_directa",
    quote: '"Go out and buy a Dell computer."',
    sourceUrls: ["https://qz.com/trump-dell-stock-endorsement-opening-bell-trump-accounts-070626"],
    status: "verificada",
    externalId: "M13",
  },
  {
    id: "demo-m14",
    saidAt: "2026-07-22T16:00+00:00",
    entryDate: "2026-07-22",
    symbol: "DELL",
    company: "Dell Technologies",
    kind: "compra_directa",
    quote: '"You know what I say? Go out and buy a Dell computer... that\'s great stuff."',
    sourceUrls: [
      "https://www.presidency.ucsb.edu/documents/remarks-marietta-georgia",
      "https://www.businessinsider.com/trump-michael-dell-hyped-up-trump-accounts-donation-2026-7",
    ],
    status: "verificada",
    externalId: "M14",
  },
  {
    id: "demo-m15",
    saidAt: "2026-09-06T16:00+00:00",
    entryDate: "2026-09-08",
    symbol: "INTC",
    company: "Intel",
    kind: "elogio_accion",
    quote: '"I\'ve made Hundreds of Billions of Dollars on Stocks... for the U.S.A., not myself."',
    sourceUrls: ["https://www.cnbc.com/2026/09/07/trump-truth-social-ai-images-posting-spree.html"],
    status: "verificada",
    externalId: "M15",
  },
];

export function demoTrumpMentions(): MentionRow[] {
  return DEMO_TRUMP_MENTIONS.map((row) => ({ ...row, sourceUrls: [...row.sourceUrls] }));
}

/**
 * Los 27 picks de la migración 018. Cita de hasta 10 palabras y URL de artículo.
 * Respaldo demo cuando no hay Supabase. El proxy inverse-cramer no entra aquí.
 */
const CRAMER_SEED: readonly (readonly [string, string, string, string, string, string])[] = [
  ["2026-09-02", "HWM", "recomienda_compra", "hold on to it or buy some", "https://www.cnbc.com/2026/09/02/cramers-lightning-round-buy-howmet-aerospace.html", "2026-09-03"],
  ["2026-09-08", "TRN", "recomienda_compra", "pull the trigger", "https://www.cnbc.com/2026/09/08/cramers-lightning-round-i-am-not-going-to-put-my-money-on-astrazeneca.html", "2026-09-09"],
  ["2026-09-08", "SPG", "recomienda_compra", "so great", "https://www.cnbc.com/2026/09/08/cramers-lightning-round-i-am-not-going-to-put-my-money-on-astrazeneca.html", "2026-09-09"],
  ["2026-09-08", "FRT", "recomienda_compra", "excellent", "https://www.cnbc.com/2026/09/08/cramers-lightning-round-i-am-not-going-to-put-my-money-on-astrazeneca.html", "2026-09-09"],
  ["2026-09-08", "JOBY", "recomienda_venta", "negativo", "https://www.cnbc.com/2026/09/08/cramers-lightning-round-i-am-not-going-to-put-my-money-on-astrazeneca.html", "2026-09-09"],
  ["2026-09-08", "GRAB", "recomienda_venta", "never liked", "https://www.cnbc.com/2026/09/08/cramers-lightning-round-i-am-not-going-to-put-my-money-on-astrazeneca.html", "2026-09-09"],
  ["2026-09-08", "AZN", "recomienda_venta", "not going to put my money", "https://www.cnbc.com/2026/09/08/cramers-lightning-round-i-am-not-going-to-put-my-money-on-astrazeneca.html", "2026-09-09"],
  ["2026-09-14", "ET", "recomienda_compra", "buy, buy, buy", "https://www.cnbc.com/2026/09/14/cramers-lightning-round-buy-energy-transfer.html", "2026-09-15"],
  ["2026-09-17", "BB", "recomienda_compra", "buy buy buy", "https://www.cnbc.com/2026/09/17/cramers-lightning-round-buy-blackberry.html", "2026-09-18"],
  ["2026-09-17", "GME", "recomienda_compra", "is a buy", "https://www.cnbc.com/2026/09/17/cramers-lightning-round-buy-blackberry.html", "2026-09-18"],
  ["2026-09-17", "CRDO", "recomienda_compra", "can buy", "https://www.cnbc.com/2026/09/17/cramers-lightning-round-buy-blackberry.html", "2026-09-18"],
  ["2026-09-17", "IRM", "recomienda_compra", "it's a buy", "https://www.cnbc.com/2026/09/17/cramers-lightning-round-buy-blackberry.html", "2026-09-18"],
  ["2026-09-17", "SNAP", "recomienda_venta", "negativo", "https://www.cnbc.com/2026/09/17/cramers-lightning-round-buy-blackberry.html", "2026-09-18"],
  ["2026-09-30", "KMI", "recomienda_compra", "I'm a buyer", "https://www.cnbc.com/2026/09/30/cramers-lightning-round-buy-kinder-morgan.html", "2026-10-01"],
  ["2026-09-30", "GRAL", "recomienda_compra", "can go higher", "https://www.cnbc.com/2026/09/30/cramers-lightning-round-buy-kinder-morgan.html", "2026-10-01"],
  ["2026-09-30", "POET", "recomienda_venta", "not recommending stocks that are losing money", "https://www.cnbc.com/2026/09/30/cramers-lightning-round-buy-kinder-morgan.html", "2026-10-01"],
  ["2026-10-05", "CIEN", "recomienda_compra", "very good", "https://www.cnbc.com/2026/10/05/cramers-lightning-round-i-think-ciena-is-very-good.html", "2026-10-06"],
  ["2026-10-05", "AVY", "recomienda_compra", "winner", "https://www.cnbc.com/2026/10/05/cramers-lightning-round-i-think-ciena-is-very-good.html", "2026-10-06"],
  ["2026-10-06", "EPD", "recomienda_compra", "you should own it", "https://www.cnbc.com/2026/10/06/cramers-lightning-round-enterprise-products-partners-is-a-really-well-run-company.html", "2026-10-07"],
  ["2026-10-06", "MTZ", "recomienda_venta", "not going to get in front", "https://www.cnbc.com/2026/10/06/cramers-lightning-round-enterprise-products-partners-is-a-really-well-run-company.html", "2026-10-07"],
  ["2026-10-12", "AMBA", "recomienda_venta", "negativo", "https://www.cnbc.com/2026/10/12/cramers-lightning-round-i-like-blackberry-very-much.html", "2026-10-13"],
  ["2026-10-12", "MDLZ", "recomienda_venta", "negativo", "https://www.cnbc.com/2026/10/12/cramers-lightning-round-i-like-blackberry-very-much.html", "2026-10-13"],
  ["2026-10-13", "PENG", "recomienda_compra", "you can buy it", "https://www.cnbc.com/2026/10/13/cramers-lightning-round-hold-on-to-element-solutions.html", "2026-10-14"],
  ["2026-10-13", "MTZ", "recomienda_compra", "buy MasTec", "https://www.cnbc.com/2026/10/13/cramers-lightning-round-hold-on-to-element-solutions.html", "2026-10-14"],
  ["2026-10-13", "STWD", "recomienda_venta", "don't want to own", "https://www.cnbc.com/2026/10/13/cramers-lightning-round-hold-on-to-element-solutions.html", "2026-10-14"],
  ["2026-10-15", "RDDT", "recomienda_compra", "buy", "https://www.cnbc.com/2026/10/15/cramers-lightning-round-buy-reddit.html", "2026-10-16"],
  ["2026-10-15", "RKLB", "recomienda_venta", "sell, sell, sell", "https://www.cnbc.com/2026/10/15/cramers-lightning-round-buy-reddit.html", "2026-10-16"],
];

function cramerRows(): MentionRow[] {
  return CRAMER_SEED.map(([fecha, symbol, kind, quote, url, entryDate]) => ({
    id: `demo-${fecha}-${symbol}`,
    saidAt: `${fecha}T22:55:00+00:00`,
    entryDate,
    symbol,
    company: null,
    kind,
    quote,
    sourceUrls: [url],
    status: "verificada",
    externalId: `${fecha}-${symbol}`,
  }));
}

export function demoCramerMentions(): MentionRow[] {
  return cramerRows().map((row) => ({ ...row, sourceUrls: [...row.sourceUrls] }));
}

/**
 * Las 4 menciones de la migración 017. Respaldo demo de musk-dice.
 * Tesla es empresa propia: se lista, no es una posición.
 */
const DEMO_MUSK_MENTIONS: readonly MentionRow[] = [
  {
    id: "demo-musk-tsla",
    saidAt: "2020-05-01T15:11:00+00:00",
    entryDate: "2020-05-01",
    symbol: "TSLA",
    company: "Tesla",
    kind: "empresa_propia",
    quote: "Tesla stock price is too high imo",
    sourceUrls: ["https://x.com/elonmusk/status/1256239815256797184"],
    status: "verificada",
    externalId: "1256239815256797184",
  },
  {
    id: "demo-musk-etsy",
    saidAt: "2021-01-26T11:25:00+00:00",
    entryDate: "2021-01-26",
    symbol: "ETSY",
    company: "Etsy",
    kind: "elogio",
    quote: "I kinda love Etsy",
    sourceUrls: ["https://x.com/elonmusk/status/1354027651468550144"],
    status: "verificada",
    externalId: "1354027651468550144",
  },
  {
    id: "demo-musk-gme",
    saidAt: "2021-01-26T21:08:00+00:00",
    entryDate: "2021-01-27",
    symbol: "GME",
    company: "GameStop",
    kind: "elogio",
    quote: "Gamestonk!!",
    sourceUrls: ["https://x.com/elonmusk/status/1354174279894642703"],
    status: "verificada",
    externalId: "1354174279894642703",
  },
  {
    id: "demo-musk-cdr",
    saidAt: "2021-01-28T02:34:00+00:00",
    entryDate: "2021-01-28",
    symbol: "CDR",
    company: "CD Projekt",
    kind: "elogio",
    quote: "It can play Cyberpunk",
    sourceUrls: ["https://x.com/elonmusk/status/1354618772586426368"],
    status: "verificada",
    externalId: "1354618772586426368",
  },
];

export function demoMuskMentions(): MentionRow[] {
  return DEMO_MUSK_MENTIONS.map((row) => ({ ...row, sourceUrls: [...row.sourceUrls] }));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function rowFromDb(raw: Record<string, unknown>): MentionRow {
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    saidAt: typeof raw.said_at === "string" ? raw.said_at : "",
    entryDate: typeof raw.entry_date === "string" ? raw.entry_date : "",
    symbol: typeof raw.symbol === "string" ? raw.symbol : "",
    company: typeof raw.company === "string" ? raw.company : null,
    kind: typeof raw.kind === "string" ? raw.kind : null,
    quote: typeof raw.quote === "string" ? raw.quote : "",
    sourceUrls: asStringArray(raw.source_urls),
    status: typeof raw.status === "string" ? raw.status : "",
    externalId: typeof raw.external_id === "string" ? raw.external_id : null,
  };
}

/**
 * Menciones verificadas del portafolio, de más reciente a más antigua.
 * Sin Supabase: Trump dice (15) si source es trump_mentions o no viene;
 * Musk (4) si source es musk_mentions; Inverse Cramer (27) si source es
 * cnbc_lightning_round. Otro source: lista vacía. isDemo true.
 * Con Supabase y sin filas (o si la consulta falla): lista vacía, isDemo false.
 * La consulta filtra por portfolio_id, así que cada cartera ve las suyas.
 */
export async function getMentions(portfolioId: string, source?: string): Promise<MentionsList> {
  if (!isSupabaseLive()) {
    if (source === "cnbc_lightning_round") {
      return { mentions: selectVerifiedMentions(cramerRows()), isDemo: true };
    }
    if (source === "musk_mentions") {
      return { mentions: selectVerifiedMentions(DEMO_MUSK_MENTIONS), isDemo: true };
    }
    if (source === undefined || source === "trump_mentions") {
      return { mentions: selectVerifiedMentions(DEMO_TRUMP_MENTIONS), isDemo: true };
    }
    return { mentions: [], isDemo: true };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("mentions")
      .select("id, said_at, entry_date, symbol, company, kind, quote, source_urls, status, external_id")
      .eq("portfolio_id", portfolioId)
      .eq("status", "verificada")
      .order("said_at", { ascending: false });

    if (error || !Array.isArray(data)) {
      if (error) console.warn("[reclu] getMentions error:", error.message);
      return { mentions: [], isDemo: false };
    }

    const rows = data.map((row) => rowFromDb(row as Record<string, unknown>));
    return { mentions: selectVerifiedMentions(rows), isDemo: false };
  } catch (err) {
    console.warn("[reclu] getMentions error:", err);
    return { mentions: [], isDemo: false };
  }
}
