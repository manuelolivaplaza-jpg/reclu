import { createClient } from "@/lib/supabase/server";
import { WIDGET_META } from "@/lib/widgets";

/**
 * Socios con marca blanca (F55).
 *
 * Un socio (corredora o medio) recibe una URL `/p/[socio]/[tipo]` con:
 *  - su logo y su nombre comercial,
 *  - su color de acento (dentro de las reglas de diseño),
 *  - la lista de portafolios que puede mostrar.
 *
 * Reglas duras:
 *  - El socio NO cambia el contenido del widget: solo elige qué
 *    portafolios públicos se ven. Los widgets son los de F52.
 *  - El acento es decorativo. Verde y rojo quedan reservados para las
 *    cifras de rendimiento (ver docs/hermes-diseno.md), así que un acento
 *    verde o rojo se rechaza y cae al negro del sistema.
 *  - El acento además tiene que tener contraste suficiente sobre blanco
 *    (WCAG AA, 4.5:1) para poder usarse como texto.
 *  - Nada de esto crea un muro: las páginas /p/* son públicas. Los datos
 *    de funcionarios de EE.UU. van gratis y fuera del muro
 *    (5 U.S.C. § 13107, src/lib/public-disclosure.ts).
 *  - Datos personales: aquí solo hay datos de una empresa (nombre, logo,
 *    slug). Leyes 19.628 y 21.719 — mínima collecting.
 *
 * Sin Supabase configurado se sirve el socio de ejemplo, igual que el
 * resto del sitio en modo demo (src/lib/demo-data.ts).
 */

/** Slug público del socio: /p/[socio]/... */
export const PARTNER_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Tipos de widget disponibles para un socio.
 *
 * "portafolios" es propio de la marca blanca: la lista de portafolios
 * que el socio puede mostrar. "ranking" reutiliza el widget de F52
 * (mismo catálogo, mismos datos, mismo método honesto) acotado a los
 * portafolios permitidos del socio.
 */
export const PARTNER_WIDGET_TIPOS = ["portafolios", "ranking"] as const;

export type PartnerWidgetTipo = (typeof PARTNER_WIDGET_TIPOS)[number];

export interface PartnerWidgetMeta {
  label: string;
  title: string;
  description: string;
}

export const PARTNER_WIDGET_META: Record<PartnerWidgetTipo, PartnerWidgetMeta> = {
  portafolios: {
    label: "Portafolios",
    title: "Portafolios",
    description:
      "Los portafolios que este socio publica, con su exceso de retorno contra el benchmark de cada país.",
  },
  // Se reutiliza el catálogo de F52: mismo título, misma descripción.
  ranking: {
    label: WIDGET_META.ranking.label,
    title: WIDGET_META.ranking.title,
    description: WIDGET_META.ranking.description,
  },
};

export function isPartnerWidgetTipo(value: string): value is PartnerWidgetTipo {
  return (PARTNER_WIDGET_TIPOS as readonly string[]).includes(value);
}

/** Negro del sistema: acento por defecto cuando el del socio no sirve. */
export const DEFAULT_ACCENT = "#0a0a0a";

/**
 * Colores reservados a las cifras de rendimiento. Un socio no puede
 * usar verde ni rojo como color de marca: rompería la lectura de las
 * cifras (verde = rinde, rojo = pierde).
 */
export const RESERVED_ACCENTS = ["#0f7a32", "#c81e1e"] as const;

/** Contraste mínimo contra blanco para usar el acento como texto. */
export const MIN_ACCENT_CONTRAST = 4.5;

export interface Partner {
  slug: string;
  nombre: string;
  logo_url: string | null;
  /** Acento ya validado (contraste + no reservado). */
  accent: string;
  /** Slugs de portafolios públicos que este socio puede mostrar. */
  portafolios: string[];
  activo: boolean;
}

/** Fila cruda de la tabla `partners` (Supabase). */
export type PartnerRow = Record<string, unknown>;

export function isValidPartnerSlug(value: string): boolean {
  return PARTNER_SLUG_RE.test(value);
}

/** Normaliza a minúsculas y recorta espacios. No corrige slugs inválidos. */
export function normalizePartnerSlug(value: string): string {
  return value.trim().toLowerCase();
}

// ---- Color de acento ----

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  let body = match[1];
  if (body.length === 3) {
    body = body
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16),
  ];
}

/** Luminancia relativa WCAG. */
export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const channels = rgb.map((value) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Razón de contraste WCAG entre dos colores. `null` si alguno no parsea. */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  if (a === null || b === null) return null;
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Acento del socio, si cumple las reglas de diseño; si no, el negro.
 *
 * Se rechaza si no es hex, si es un color reservado al rendimiento
 * (verde/rojo) o si no alcanza contraste AA sobre blanco.
 */
export function resolveAccent(value: string | null | undefined): string {
  if (typeof value !== "string") return DEFAULT_ACCENT;
  const hex = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/.test(hex)) return DEFAULT_ACCENT;
  const normalized = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  if ((RESERVED_ACCENTS as readonly string[]).includes(normalized)) {
    return DEFAULT_ACCENT;
  }
  const contrast = contrastRatio(normalized, "#ffffff");
  if (contrast === null || contrast < MIN_ACCENT_CONTRAST) return DEFAULT_ACCENT;
  return normalized;
}

// ---- Mapeo de filas ----

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asSlugList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const slugs = new Set<string>();
  for (const item of value) {
    const text = asText(item);
    if (text && isValidPartnerSlug(normalizePartnerSlug(text))) {
      slugs.add(normalizePartnerSlug(text));
    }
  }
  return [...slugs];
}

/**
 * Convierte una fila de `partners` en un socio usable. Descarta lo que no
 * cumple el contrato en vez de propagarlo a la UI.
 */
export function toPartner(row: PartnerRow): Partner | null {
  const slug = asText(row.slug);
  const nombre = asText(row.nombre);
  if (!slug || !nombre) return null;
  const normalizedSlug = normalizePartnerSlug(slug);
  if (!isValidPartnerSlug(normalizedSlug)) return null;

  const logo = asText(row.logo_url);
  const logoUrl = logo && /^https:\/\//i.test(logo) ? logo : null;

  return {
    slug: normalizedSlug,
    nombre,
    logo_url: logoUrl,
    accent: resolveAccent(asText(row.accent)),
    portafolios: asSlugList(row.portafolios),
    activo: asBool(row.activo),
  };
}

/** Socio de ejemplo (modo demo). No es un cliente real. */
export const DEMO_PARTNERS: Partner[] = [
  {
    slug: "demo",
    nombre: "Socio de ejemplo",
    logo_url: null,
    accent: DEFAULT_ACCENT,
    portafolios: ["renta4-moderada", "btg-insights"],
    activo: true,
  },
];

// ---- Consulta ----

function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

/**
 * Socio por slug. Solo devuelve socios activos: la política RLS
 * "partners public read active" también lo restringe en la base.
 * `null` si no existe, está inactivo o el slug no es válido.
 */
export async function getPartnerBySlug(slug: string): Promise<Partner | null> {
  const normalized = normalizePartnerSlug(slug);
  if (!isValidPartnerSlug(normalized)) return null;

  if (!isSupabaseLive()) {
    return DEMO_PARTNERS.find((p) => p.slug === normalized) ?? null;
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("partners")
      .select("slug, nombre, logo_url, accent, portafolios, activo")
      .eq("slug", normalized)
      .eq("activo", true)
      .maybeSingle();

    if (error || !data) {
      if (error) {
        console.warn("[reclu] getPartnerBySlug error:", error.message);
      }
      return null;
    }
    const partner = toPartner(data as PartnerRow);
    if (!partner || !partner.activo) return null;
    return partner;
  } catch (err) {
    console.warn(
      "[reclu] getPartnerBySlug error:",
      err instanceof Error ? err.message : "unknown",
    );
    return null;
  }
}

// ---- Alcance del socio ----

/** ¿El socio puede mostrar este portafolio? */
export function partnerAllowsPortfolio(
  partner: Partner,
  portfolioSlug: string,
): boolean {
  const normalized = normalizePartnerSlug(portfolioSlug);
  return partner.portafolios.includes(normalized);
}

/**
 * Filtra una lista de portafolios dejando solo los que el socio puede
 * mostrar. El orden de la lista original se conserva.
 */
export function filterAllowedPortfolios<T extends { slug: string }>(
  partner: Partner,
  portfolios: T[],
): T[] {
  return portfolios.filter((portfolio) =>
    partnerAllowsPortfolio(partner, portfolio.slug),
  );
}

/** Estilo inline del acento, para el filete de la marca blanca. */
export function accentStyle(partner: Partner): { borderColor: string } {
  return { borderColor: partner.accent };
}
