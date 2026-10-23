/**
 * Avatar de portafolio (D4) — lógica pura, sin React ni red.
 *
 * Decide qué se ve en el avatar de cada portafolio:
 *  1. Retrato oficial de dominio público (/portraits) si existe.
 *  2. Si no, la ilustración de portada (/covers).
 *  3. Si no, un degradado determinista del slug con las iniciales.
 *
 * La migración 055 puede no estar aplicada todavía: los campos llegan
 * `undefined` y todo cae al fallback sin romper nada.
 *
 * Cubierto en `tests/portfolio-avatar.test.ts`.
 */

import type { PortfolioCategory } from "@/lib/types";

// ---- Iniciales ----

/**
 * Palabras que no aportan identidad al avatar: se sacan antes de tomar
 * iniciales ("Pelosi Tracker" => "PE", no "PT").
 */
const INITIALS_STOP_WORDS = new Set(["tracker", "13f"]);

/**
 * Iniciales del nombre para el avatar: 2 letras, mayúsculas.
 *
 * - Se ignora "Tracker" y "13F" (sufijos del producto, no del sujeto).
 * - "Nancy Pelosi Tracker" => "NP" · "Trump Dice" => "TD" · "Renta 4" => "R4".
 * - Con una sola palabra se toman sus 2 primeras letras: "Pelosi" => "PE".
 * - Sin nada usable devuelve "" (el avatar solo muestra el degradado).
 */
export function avatarInitials(name: string | null | undefined): string {
  if (!name) return "";
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .filter((word) => !INITIALS_STOP_WORDS.has(word.toLowerCase()));
  if (words.length === 0) return "";
  const first = words[0].charAt(0);
  const second =
    words.length > 1 ? words[1].charAt(0) : (words[0].charAt(1) ?? "");
  const initials = `${first}${second}`.toUpperCase();
  return initials.replace(/[^A-Z0-9\u00C0-\u024F]/gu, "");
}

// ---- Degradado ----

/**
 * Seis degradados de la paleta Reclu (grises de la escala neutral, la marca
 * es blanco y negro). Todos oscuros: las iniciales van en blanco y deben
 * cumplir contraste AA sobre cualquier punto del degradado (el gris más
 * claro usado es neutral-500).
 */
const AVATAR_GRADIENTS: readonly string[] = [
  "from-neutral-700 to-neutral-900",
  "from-neutral-500 to-neutral-800",
  "from-neutral-600 to-neutral-950",
  "from-neutral-800 to-neutral-500",
  "from-neutral-900 to-neutral-700",
  "from-neutral-500 to-neutral-950",
] as const;

/**
 * Hash FNV-1a de 32 bits, determinista entre sesiones y entornos.
 */
function hashSlug(slug: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i);
    // 32-bit FNV multiply (multiplicación módulo 2^32).
    hash = Math.imul(hash, 0x01000193);
  }
  // Unsigned para que el módulo no dé negativos.
  return hash >>> 0;
}

/**
 * Degradado del avatar: hash determinista del slug -> uno de los 6
 * degradados (`"from-neutral-700 to-neutral-900"`, etc.). El mismo slug
 * siempre recibe el mismo degradado (evita parpadeo entre renders).
 */
export function avatarGradient(slug: string | null | undefined): string {
  const text = typeof slug === "string" && slug.length > 0 ? slug : "reclu";
  return AVATAR_GRADIENTS[hashSlug(text) % AVATAR_GRADIENTS.length];
}

// ---- Ícono por categoría ----

/**
 * Ícono lucide de cada categoría. Se devuelve el NOMBRE (no el componente)
 * para mantener este archivo puro (sin importar lucide-react acá); el
 * componente lo resuelve con su propio mapa.
 */
const CATEGORY_ICONS: Record<PortfolioCategory, string> = {
  political_us: "Landmark",
  hedge_fund: "Briefcase",
  broker_cl: "Building2",
  public_disclosure: "FileText",
  model: "Cpu",
  thematic: "Sparkles",
};

/** Nombre del ícono lucide para una categoría (Landmark, Briefcase, ...). */
export function categoryIcon(category: PortfolioCategory): string {
  return CATEGORY_ICONS[category] ?? "Sparkles";
}

// ---- Fuente del avatar ----

/** Portadas genéricas compartidas que no se muestran como avatar. */
export const GENERIC_COVERS: ReadonlySet<string> = new Set(["02-toro.png"]);

/** Qué imagen (si hay) usa el avatar. */
export type AvatarSource =
  | { kind: "portrait"; src: string }
  | { kind: "cover"; src: string }
  | { kind: "initials" };

/** Campos que `avatarSource` necesita del portafolio. */
export interface AvatarSourceInput {
  slug?: string | null;
  portrait_image?: string | null;
  cover_image?: string | null;
}

/**
 * Prioridad de imagen del avatar:
 *  1. retrato oficial (`/portraits/<archivo>`) si existe;
 *  2. si no, portada (`/covers/<archivo>`);
 *  3. si no, solo iniciales sobre degradado.
 *
 * Tolerante a la 055 sin aplicar: campos `undefined` caen al fallback.
 */
export function avatarSource(portfolio: AvatarSourceInput): AvatarSource {
  const portrait = portfolio?.portrait_image;
  if (typeof portrait === "string" && portrait.length > 0) {
    return { kind: "portrait", src: `/portraits/${portrait}` };
  }
  const cover = portfolio?.cover_image;
  // D28: la ilustración genérica del toro la compartían todos los ARK;
  // no identifica a nadie. Se usa el avatar de iniciales.
  if (typeof cover === "string" && cover.length > 0 && !GENERIC_COVERS.has(cover)) {
    return { kind: "cover", src: `/covers/${cover}` };
  }
  return { kind: "initials" };
}
