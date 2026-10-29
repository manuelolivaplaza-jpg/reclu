/**
 * D40: presentación de símbolos y nombres de posiciones.
 * - Nombres del 13F/ETF en MAYÚSCULAS -> Title Case, sin sufijos legales.
 * - Etiqueta de lado ("Corto"/"Largo") consistente: si alguna fila trae el
 *   prefijo "Corto:", todas las filas del portafolio muestran su lado.
 * - Slugs largos (Polymarket) se truncan para no desbordar en móvil.
 * Puro y sin datos inventados: si no hay nombre real, se deja vacío.
 */

const SHORT_PREFIX = /^\s*corto\s*:\s*/i;
const LEGAL_SUFFIX =
  /(?:[\s,.-]+(?:inc|incorporated|corp|corporation|co|company|ltd|limited|plc|sa|s\.a|saci|nv|n\.v|ag|se|lp|l\.p|sh|cl\s*[ab]|class\s*[ab]|-\s*[ab]))+\.?\s*$/i;
const KEEP_UPPER = new Set(["ETF", "ADR", "REIT", "USA", "US", "AI", "II", "III", "IV", "BHP", "SQM", "BCI", "LATAM", "CMPC", "AES", "IBM", "AMD", "ASML", "NV", "SPDR", "TSMC", "ARK", "BTG", "AFP"]);

function isMostlyUpper(text: string): boolean {
  const letters = text.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÑ]/g, "").length;
  return upper / letters.length > 0.85;
}

function titleWord(word: string): string {
  if (KEEP_UPPER.has(word.toUpperCase().replace(/[^A-Z]/g, ""))) return word.toUpperCase();
  if (/\d/.test(word)) return word;
  const lower = word.toLowerCase();
  if (["de", "del", "la", "las", "los", "y", "e", "do", "da", "of", "and", "the"].includes(lower)) return lower;
  return lower.replace(/(^|[-/&'(])([a-záéíóúñ])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** "TESLA INC" -> "Tesla"; "SPACE EXPLORATION TECHN-CL A" -> "Space Exploration Techn". */
export function prettyCompanyName(raw: string | null | undefined): string {
  let name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return "";
  const upper = isMostlyUpper(name);
  for (let i = 0; i < 3; i++) {
    const next = name.replace(LEGAL_SUFFIX, "").trim();
    if (!next || next === name) break;
    name = next;
  }
  if (!upper) return name;
  return name
    .split(" ")
    .map((w, i) => {
      const t = titleWord(w);
      return i === 0 ? t.charAt(0).toUpperCase() + t.slice(1) : t;
    })
    .join(" ");
}

/** Símbolo legible: los slugs largos (Polymarket) se truncan. */
export function displaySymbol(symbol: string, max = 12): string {
  const s = String(symbol ?? "").trim();
  if (s.length <= max) return s;
  if (s.includes("-")) return `${s.slice(0, max - 1).replace(/-+$/, "")}…`;
  return `${s.slice(0, max - 1)}…`;
}

export interface DisplayRow {
  symbol: string;
  name: string;
}

/**
 * Normaliza filas de composición o holdings para mostrar.
 * `names`: nombres reales por símbolo (de otras filas de holdings) para
 * completar los que vienen vacíos o iguales al símbolo.
 */
export function displayHoldings<T extends DisplayRow>(rows: readonly T[], names: ReadonlyMap<string, string> = new Map()): (T & { displaySymbol: string; side: "Corto" | "Largo" | null })[] {
  const anyShort = rows.some((r) => SHORT_PREFIX.test(String(r.name ?? "")));
  return rows.map((r) => {
    const rawName = String(r.name ?? "");
    const short = SHORT_PREFIX.test(rawName);
    let base = rawName.replace(SHORT_PREFIX, "").trim();
    if (!base || base.toUpperCase() === String(r.symbol).toUpperCase()) base = names.get(String(r.symbol).toUpperCase()) ?? "";
    const pretty = prettyCompanyName(base);
    return {
      ...r,
      name: pretty && pretty.toUpperCase() !== String(r.symbol).toUpperCase() ? pretty : "",
      displaySymbol: displaySymbol(r.symbol),
      side: anyShort ? (short ? "Corto" : "Largo") : null,
    };
  });
}

/** Etiqueta legible de la fuente del portafolio. */
const SOURCE_LABELS: Record<string, string> = {
  sec_13f: "SEC 13F",
  sec13f: "SEC 13F",
  sec_form4: "SEC Form 4",
  trump_mentions: "Menciones públicas de Donald Trump",
  musk_mentions: "Menciones públicas de Elon Musk",
  public_mentions: "Menciones públicas",
  cnbc_lightning_round: "CNBC (Lightning Round)",
  inverse_cramer: "CNBC (Jim Cramer)",
  capitol_trades: "Capitol Trades",
  house_clerk: "Cámara de Representantes (EE.UU.)",
  congress_invests: "Declaraciones del Congreso (EE.UU.)",
  oge_278t: "OGE 278-T",
  spensiones: "Superintendencia de Pensiones",
  infoprobidad: "InfoProbidad",
  renta4: "Renta 4",
  btg: "BTG Pactual",
  larrainvial: "LarrainVial",
  truth_social: "Truth Social",
  model: "Modelo Fraccion",
  reclu: "Fraccion",
  manual: "Selección manual",
  pricing: "Emisor del ETF",
  polymarket: "Polymarket",
};

export function sourceLabel(source: string | null | undefined): string {
  const key = String(source ?? "").trim();
  if (!key) return "";
  return SOURCE_LABELS[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
