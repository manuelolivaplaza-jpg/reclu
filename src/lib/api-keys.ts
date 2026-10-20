/**
 * Claves de API — generación, hash y límite por plan (F53).
 *
 * Reglas de oro:
 *   * La clave en claro solo existe en memoria, una vez, al crearla.
 *   * En la base se guarda `sha256(clave)` (64 hex) y un `prefix` público.
 *   * La comparación usa `timingSafeEqual` para no filtrar el hash.
 *   * Todo el acceso queda detrás de `API_PUBLIC_ENABLED=true`; cualquier
 *     otro valor (o la ausencia) mantiene la API apagada.
 *
 * La persistencia vive en `supabase/migrations/040_api_claves.sql`
 * (`api_keys`, `api_usage`) y el consumo diario en `consume_api_usage`.
 * Las leyes 19.628 y 21.719 piden mínimo de datos: solo guardamos el
 * dueño, una etiqueta opcional y el contador del día (sin IP ni user-agent).
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FormState } from "@/lib/form-state";

// ---- Formato ----

/** Prefijo visible de toda clave de reclu. */
export const API_KEY_PREFIX = "rcl";

/** Bytes de entropía del secreto (256 bits → 43 caracteres base64url). */
export const API_KEY_SECRET_BYTES = 32;

/** `rcl_` + 12 hex de prefijo + `_` + 43 caracteres del secreto. */
const API_KEY_RE = /^rcl_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/;

/** sha256 en hexadecimal. */
const API_KEY_HASH_RE = /^[a-f0-9]{64}$/;

/** Hash de relleno: misma latencia cuando la clave no existe. */
const DUMMY_HASH = "0".repeat(64);

// ---- Planes y límites ----

export type ApiPlan = "free" | "pro" | "elite";

/**
 * Límite diario de llamadas por clave y plan. Es un tope anti-abuso, no
 * una cuota comercial: deja margen para integraciones normales.
 */
export const API_DAILY_LIMITS: Record<ApiPlan, number> = {
  free: 100,
  pro: 1000,
  elite: 10000,
};

export interface GeneratedApiKey {
  /** Clave completa: se muestra UNA vez y no se vuelve a guardar. */
  plaintext: string;
  /** Identificador público (`rcl_ab12cd34ef56`), seguro para mostrar. */
  prefix: string;
  /** sha256 hex de `plaintext`; esto es lo único que va a la base. */
  hash: string;
}

/** Tipo de retorno de las acciones de Ajustes → API. */
export interface ApiKeyFormState extends FormState {
  /** Clave recién creada. Solo viaja en la respuesta de esa acción. */
  key?: string;
}

// ---- Flag ----

/** True solo con `API_PUBLIC_ENABLED=true` (exacto, minúsculas). */
export function apiPublicEnabled(): boolean {
  return process.env.API_PUBLIC_ENABLED === "true";
}

// ---- Generación y hash ----

/** Genera una clave nueva y su hash. Nunca registra ni persiste el claro. */
export function generateApiKey(): GeneratedApiKey {
  const prefix = `${API_KEY_PREFIX}_${randomBytes(6).toString("hex")}`;
  const secret = randomBytes(API_KEY_SECRET_BYTES).toString("base64url");
  const plaintext = `${prefix}_${secret}`;
  return { plaintext, prefix, hash: hashApiKey(plaintext) };
}

/** sha256 en hex (minúsculas). Determinista, sin sal: la clave ya es aleatoria. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** Valida la forma de una clave sin tocar la base. */
export function isApiKeyFormat(key: string | null | undefined): key is string {
  return typeof key === "string" && API_KEY_RE.test(key);
}

/**
 * Compara una clave presentada contra el hash guardado en tiempo constante.
 * Un hash ausente o mal formado falla cerrado (nunca "coincide por defecto").
 */
export function verifyApiKey(
  presented: string,
  storedHash: string | null | undefined,
): boolean {
  if (typeof presented !== "string" || presented.length === 0) return false;

  const presentedHash = hashApiKey(presented);
  const expected =
    typeof storedHash === "string" && API_KEY_HASH_RE.test(storedHash)
      ? storedHash.toLowerCase()
      : DUMMY_HASH;

  const matches = timingSafeEqual(
    Buffer.from(presentedHash, "hex"),
    Buffer.from(expected, "hex"),
  );
  return matches && expected !== DUMMY_HASH;
}

/** Extrae el token de `Authorization: Bearer <clave>`. */
export function extractBearerToken(
  authorization: string | null | undefined,
): string | null {
  if (typeof authorization !== "string") return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match ? match[1] : null;
}

// ---- Límite diario ----

/** Día UTC en formato `YYYY-MM-DD`, igual que la columna `api_usage.day`. */
export function apiDayKey(now: Date | number = Date.now()): string {
  const date = now instanceof Date ? now : new Date(now);
  return date.toISOString().slice(0, 10);
}

/** Cualquier plan desconocido cae a Gratis (falla cerrado). */
export function normalizeApiPlan(plan?: string | null): ApiPlan {
  return plan === "pro" || plan === "elite" ? plan : "free";
}

/** Límite diario del plan (Gratis si no se reconoce). */
export function apiDailyLimit(plan?: string | null): number {
  return API_DAILY_LIMITS[normalizeApiPlan(plan)];
}

export interface ApiRateLimitState {
  plan?: string | null;
  /** Consumo registrado en `api_usage` para `day`. */
  used: number;
  /** Día del contador; null/undefined si aún no hay fila. */
  day?: string | null;
  /** Día actual (`apiDayKey()`), inyectable para tests. */
  today: string;
}

export interface ApiRateLimitDecision {
  allowed: boolean;
  limit: number;
  /** Consumo efectivo del día actual (0 si el contador es de otro día). */
  used: number;
  remaining: number;
  /** true si la fila era de otro día y hay que empezar de cero. */
  stale: boolean;
  /** Día al que corresponde esta decisión. */
  day: string;
}

/** Decide si la llamada cabe en el límite diario, sin efectos secundarios. */
export function rateLimit(state: ApiRateLimitState): ApiRateLimitDecision {
  const plan = normalizeApiPlan(state.plan);
  const limit = API_DAILY_LIMITS[plan];
  const stale = state.day !== state.today;
  const used = stale ? 0 : Math.max(0, Math.floor(state.used));
  const remaining = Math.max(0, limit - used);

  return {
    allowed: used < limit,
    limit,
    used: Math.min(used, limit),
    remaining,
    stale,
    day: state.today,
  };
}

/** Cabeceras estándar para respuestas de la API (incluida la 429). */
export function rateLimitHeaders(
  decision: ApiRateLimitDecision,
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
    "X-RateLimit-Used": String(decision.used),
    "X-RateLimit-Reset": decision.day,
  };
}

// ---- Autenticación ----

/** Fila mínima de `api_keys` que necesita la verificación. */
export interface ApiKeyRecord {
  prefix: string;
  key_hash: string;
  plan?: string | null;
  revoked?: boolean | null;
}

export type ApiAuthResult =
  | {
      ok: true;
      prefix: string;
      plan: ApiPlan;
      limit: number;
    }
  | {
      ok: false;
      status: 401 | 403 | 503;
      error: string;
    };

/**
 * Autentica una request contra una fila ya buscada por prefijo.
 *
 * El caller busca por `prefix` (indexado), no por hash, para que la base
 * no tenga que escanear la tabla. La decisión de aceptar o no es de esta
 * función y siempre compara en tiempo constante.
 */
export function authenticateApiKey(
  authorization: string | null | undefined,
  record: ApiKeyRecord | null | undefined,
  enabled: boolean = apiPublicEnabled(),
): ApiAuthResult {
  if (!enabled) {
    return {
      ok: false,
      status: 503,
      error: "La API pública no está habilitada.",
    };
  }

  const token = extractBearerToken(authorization);
  if (!isApiKeyFormat(token)) {
    return {
      ok: false,
      status: 401,
      error: "Falta una clave de API válida (Authorization: Bearer).",
    };
  }

  if (!record) {
    // Misma latencia que un hash incorrecto: no delata si la clave existe.
    verifyApiKey(token, null);
    return { ok: false, status: 401, error: "Clave de API inválida." };
  }

  if (!verifyApiKey(token, record.key_hash)) {
    return { ok: false, status: 401, error: "Clave de API inválida." };
  }

  if (record.revoked) {
    return { ok: false, status: 403, error: "Clave de API revocada." };
  }

  const plan = normalizeApiPlan(record.plan);
  return {
    ok: true,
    prefix: record.prefix,
    plan,
    limit: API_DAILY_LIMITS[plan],
  };
}
