/**
 * B1/T3 — 404 real para /accion/<ticker> inexistente.
 *
 * Mismo patrón que `portfolio-slug-gate.ts` (d65): con cacheComponents la
 * ficha se transmite por streaming y un `notFound()` dentro de la página llega
 * cuando la respuesta ya salió con HTTP 200 (soft-404). El proxy decide antes
 * de renderizar: si el símbolo no existe en el catálogo, reescribe a una ruta
 * inexistente y Next responde la página 404 con estado 404.
 *
 * Regla 1b (Manu): un ticker REAL nunca da 404, aunque el rol actual vea 0
 * carteras. La existencia se confirma SÍMBOLO POR SÍMBOLO (dos lecturas
 * pequeñas) porque aquí no se puede llamar a `getKnownTickerSymbols()`:
 * `cacheLife()` solo funciona dentro del render de App Router, y leer el libro
 * completo de todas las carteras no cabe en el presupuesto del proxy.
 *
 * Criterio (idéntico al de `src/lib/public-tickers.ts`): el ticker existe si
 * hay al menos una fila en `holdings` con ese símbolo (cualquier cartera y
 * cualquier snapshot: un activo vendido sigue siendo real) o una fila curada
 * en `ticker_profile`.
 *
 * Ante cualquier duda —sin URL o sin service key, error de red, timeout,
 * respuesta rara, catálogo vacío— NO bloquea: deja pasar y la página resuelve
 * como siempre. Con el muro de la migración 012 `holdings` no es legible con
 * la clave anónima, así que la lectura usa `SUPABASE_SERVICE_ROLE_KEY`; la
 * clave no sale de este proceso.
 *
 * Este módulo no importa nada de la app a propósito: el proxy lo carga en su
 * propio bundle y debe quedar sin dependencias de React/Next.
 */

const TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 1500;
const MAX_PROBES = 500;
const ACCION_RE = /^\/accion\/([^/]+)\/?$/;

/** Símbolo normalizado (trim + mayúsculas), misma regla que ticker-queries. */
export function normalizeAccionSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Símbolo de /accion/<x> (un solo segmento), o null si la ruta es otra. */
export function accionSymbolFromPath(pathname: string): string | null {
  const match = ACCION_RE.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url.startsWith("https://") || url.includes("placeholder") || !key) {
    return null;
  }
  return { url: url.replace(/\/$/, ""), key };
}

/** GET a PostgREST. Devuelve las filas, o null si la lectura no es confiable. */
async function fetchRows(url: string, key: string): Promise<unknown[] | null> {
  try {
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rows: unknown = await res.json();
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

/** ILIKE exacto: `%` y `_` no actúan como comodines. */
function escapeLike(symbol: string): string {
  return symbol.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** True si el catálogo tiene alguna fila. null = no se pudo comprobar. */
async function catalogHasRows(env: { url: string; key: string }): Promise<boolean | null> {
  const rows = await fetchRows(
    `${env.url}/rest/v1/holdings?select=portfolio_id&limit=1`,
    env.key,
  );
  if (rows === null) return null;
  if (rows.length > 0) return true;

  // Sin holdings puede haber solo perfiles curados: cuentan como catálogo.
  const profiles = await fetchRows(
    `${env.url}/rest/v1/ticker_profile?select=symbol&limit=1`,
    env.key,
  );
  if (profiles === null) return null;
  return profiles.length > 0;
}

/**
 * ¿Existe el símbolo? `true` / `false` cuando la respuesta es confiable,
 * `null` cuando no se pudo comprobar.
 */
async function symbolExists(symbol: string): Promise<boolean | null> {
  const env = supabaseEnv();
  if (!env) return null;

  const holdings = await fetchRows(
    `${env.url}/rest/v1/holdings?select=portfolio_id&symbol=ilike.${encodeURIComponent(
      escapeLike(symbol),
    )}&limit=1`,
    env.key,
  );
  if (holdings === null) return null;
  if (holdings.length > 0) return true;

  const profile = await fetchRows(
    `${env.url}/rest/v1/ticker_profile?select=symbol&symbol=eq.${encodeURIComponent(
      symbol,
    )}&limit=1`,
    env.key,
  );
  if (profile === null) return null;
  return profile.length > 0;
}

interface CatalogProbe {
  at: number;
  /** true = el catálogo tiene datos; false = vacío; null = no se pudo leer. */
  hasRows: boolean | null;
}

interface SymbolProbe {
  at: number;
  unknown: boolean;
}

let catalog: CatalogProbe | null = null;
const probes = new Map<string, SymbolProbe>();

async function catalogState(env: { url: string; key: string }, now: number): Promise<boolean | null> {
  if (catalog && now - catalog.at < TTL_MS) return catalog.hasRows;
  const hasRows = await catalogHasRows(env);
  if (hasRows === null) {
    // Un fallo puntual no invalida lo último que se supo.
    return catalog?.hasRows ?? null;
  }
  catalog = { at: now, hasRows };
  return hasRows;
}

/**
 * true SOLO si estamos seguros de que el símbolo no existe: el catálogo
 * respondió con datos y el símbolo no está ni en `holdings` ni en
 * `ticker_profile`. Cualquier duda (catálogo vacío, error, timeout) => false.
 */
export async function isUnknownAccionSymbol(raw: string): Promise<boolean> {
  const symbol = normalizeAccionSymbol(raw);
  if (!symbol) return false;

  const env = supabaseEnv();
  if (!env) return false;

  const now = Date.now();
  const cached = probes.get(symbol);
  if (cached && now - cached.at < TTL_MS) return cached.unknown;

  // Camino rápido (ticker real): una consulta por símbolo. Solo si no aparece
  // se comprueba que el catálogo tenga datos, para no 404 en una base vacía.
  const exists = await symbolExists(symbol);
  if (exists === null) return false;
  if (exists) {
    if (probes.size >= MAX_PROBES) probes.clear();
    probes.set(symbol, { at: now, unknown: false });
    return false;
  }

  const hasRows = await catalogState(env, now);
  if (hasRows !== true) return false;

  if (probes.size >= MAX_PROBES) probes.clear();
  probes.set(symbol, { at: now, unknown: true });
  return true;
}

/** Solo para pruebas. */
export function __resetAccionGate(): void {
  catalog = null;
  probes.clear();
}
