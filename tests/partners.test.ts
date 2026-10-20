import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCENT,
  DEMO_PARTNERS,
  MIN_ACCENT_CONTRAST,
  PARTNER_SLUG_RE,
  PARTNER_WIDGET_META,
  PARTNER_WIDGET_TIPOS,
  RESERVED_ACCENTS,
  contrastRatio,
  filterAllowedPortfolios,
  isPartnerWidgetTipo,
  isValidPartnerSlug,
  normalizePartnerSlug,
  partnerAllowsPortfolio,
  relativeLuminance,
  resolveAccent,
  toPartner,
  type Partner,
} from "@/lib/partners";

const raiz = process.cwd();

function fuente(rutaRelativa: string): string {
  return readFileSync(path.join(raiz, rutaRelativa), "utf8");
}

function socio(overrides: Partial<Partner> = {}): Partner {
  return {
    slug: "demo",
    nombre: "Socio de ejemplo",
    logo_url: null,
    accent: DEFAULT_ACCENT,
    portafolios: ["renta4-moderada"],
    activo: true,
    ...overrides,
  };
}

describe("slug del socio", () => {
  it("acepta slugs en kebab-case minúsculo", () => {
    for (const valor of ["demo", "renta4", "corredora-norte", "a1-b2"]) {
      expect(isValidPartnerSlug(valor)).toBe(true);
    }
  });

  it("rechaza slugs con mayúsculas, espacios o símbolos", () => {
    for (const valor of [
      "",
      "Demo",
      "renta 4",
      "renta_4",
      "renta4/",
      "-renta4",
      "renta4-",
      "socio.cl",
      "ñ",
    ]) {
      expect(isValidPartnerSlug(valor)).toBe(false);
    }
  });

  it("la expresión regular es la misma que usa la validación", () => {
    expect(PARTNER_SLUG_RE.source).toBe("^[a-z0-9]+(-[a-z0-9]+)*$");
  });

  it("normaliza recortando y pasando a minúsculas", () => {
    expect(normalizePartnerSlug("  Renta4  ")).toBe("renta4");
  });
});

describe("color de acento del socio", () => {
  it("acepta un color oscuro con buen contraste", () => {
    expect(resolveAccent("#123456")).toBe("#123456");
    expect(resolveAccent("#1B3A5C")).toBe("#1b3a5c");
  });

  it("cae al negro del sistema si el color no es hex", () => {
    for (const valor of ["rojo", "#12345", "rgb(1,2,3)", "", null, undefined]) {
      expect(resolveAccent(valor as string | null | undefined)).toBe(
        DEFAULT_ACCENT,
      );
    }
  });

  it("rechaza verde y rojo: están reservados a las cifras de rendimiento", () => {
    for (const valor of RESERVED_ACCENTS) {
      expect(resolveAccent(valor)).toBe(DEFAULT_ACCENT);
    }
  });

  it("rechaza colores claros sin contraste suficiente sobre blanco", () => {
    // #cccccc sobre blanco da ~1.6:1, muy por debajo de AA.
    expect(resolveAccent("#cccccc")).toBe(DEFAULT_ACCENT);
    expect(resolveAccent("#ffff00")).toBe(DEFAULT_ACCENT);
  });

  it("el contraste se calcula con la fórmula WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("no-es-hex")).toBeNull();
  });

  it("el mínimo de contraste exigido es AA (4.5:1)", () => {
    expect(MIN_ACCENT_CONTRAST).toBe(4.5);
    const elegido = resolveAccent("#123456");
    const ratio = contrastRatio(elegido, "#ffffff");
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
  });

  it("nunca devuelve verde ni rojo como acento", () => {
    for (const valor of ["#0f7a32", "#c81e1e", "#0F7A32", "#C81E1E"]) {
      expect(RESERVED_ACCENTS).not.toContain(resolveAccent(valor));
    }
  });
});

describe("toPartner", () => {
  it("mapea una fila válida", () => {
    const partner = toPartner({
      slug: "renta4",
      nombre: "Renta 4",
      logo_url: "https://cdn.reclu.cl/logo.png",
      accent: "#123456",
      portafolios: ["renta4-moderada", "btg-insights"],
      activo: true,
    });
    expect(partner).not.toBeNull();
    expect(partner!.slug).toBe("renta4");
    expect(partner!.nombre).toBe("Renta 4");
    expect(partner!.logo_url).toBe("https://cdn.reclu.cl/logo.png");
    expect(partner!.accent).toBe("#123456");
    expect(partner!.portafolios).toEqual(["renta4-moderada", "btg-insights"]);
    expect(partner!.activo).toBe(true);
  });

  it("descarta filas sin slug o sin nombre", () => {
    expect(toPartner({ nombre: "Sin slug" })).toBeNull();
    expect(toPartner({ slug: "sin-nombre" })).toBeNull();
    expect(toPartner({ slug: "   ", nombre: "Vacío" })).toBeNull();
  });

  it("descarta slugs inválidos", () => {
    expect(
      toPartner({ slug: "Socio Con Espacios", nombre: "X" }),
    ).toBeNull();
  });

  it("solo acepta logos https", () => {
    const partner = toPartner({
      slug: "demo",
      nombre: "Demo",
      logo_url: "javascript:alert(1)",
    });
    expect(partner!.logo_url).toBeNull();
  });

  it("filtra slugs inválidos de la lista de portafolios y elimina duplicados", () => {
    const partner = toPartner({
      slug: "demo",
      nombre: "Demo",
      portafolios: ["renta4-moderada", "renta4-moderada", "No Válido", 42],
    });
    expect(partner!.portafolios).toEqual(["renta4-moderada"]);
  });

  it("el acento se valida al mapear, no se trusts la fila", () => {
    const partner = toPartner({
      slug: "demo",
      nombre: "Demo",
      accent: "#0f7a32",
    });
    expect(partner!.accent).toBe(DEFAULT_ACCENT);
  });
});

describe("alcance del socio", () => {
  it("permite solo los portafolios de su lista", () => {
    const p = socio({ portafolios: ["renta4-moderada", "btg-insights"] });
    expect(partnerAllowsPortfolio(p, "renta4-moderada")).toBe(true);
    expect(partnerAllowsPortfolio(p, "btg-insights")).toBe(true);
    expect(partnerAllowsPortfolio(p, "pelosi-tracker")).toBe(false);
  });

  it("filtra una lista de portafolios conservando el orden original", () => {
    const p = socio({ portafolios: ["btg-insights"] });
    const lista = [
      { slug: "renta4-moderada" },
      { slug: "btg-insights" },
      { slug: "pelosi-tracker" },
    ];
    expect(filterAllowedPortfolios(p, lista).map((x) => x.slug)).toEqual([
      "btg-insights",
    ]);
  });

  it("un socio sin portafolios no muestra ninguno", () => {
    const p = socio({ portafolios: [] });
    expect(
      filterAllowedPortfolios(p, [{ slug: "renta4-moderada" }]),
    ).toEqual([]);
  });
});

describe("catálogo de widgets de socio", () => {
  it("define los tipos esperados", () => {
    expect([...PARTNER_WIDGET_TIPOS]).toEqual(["portafolios", "ranking"]);
  });

  it("acepta los tipos válidos y rechaza el resto", () => {
    for (const tipo of PARTNER_WIDGET_TIPOS) {
      expect(isPartnerWidgetTipo(tipo)).toBe(true);
    }
    for (const valor of ["", "afp", "insiders", "portafolios ", "PORTFOLIOS"]) {
      expect(isPartnerWidgetTipo(valor)).toBe(false);
    }
  });

  it("cada tipo tiene metadatos en español", () => {
    for (const tipo of PARTNER_WIDGET_TIPOS) {
      const meta = PARTNER_WIDGET_META[tipo];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.title.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(20);
    }
  });

  it("el tipo ranking reutiliza el catálogo de F52", () => {
    expect(PARTNER_WIDGET_META.ranking.title).toBe("Ranking honesto");
  });
});

describe("socio de ejemplo (modo demo)", () => {
  it("existe al menos un socio de ejemplo activo", () => {
    expect(DEMO_PARTNERS.length).toBeGreaterThan(0);
    for (const p of DEMO_PARTNERS) {
      expect(p.activo).toBe(true);
      expect(isValidPartnerSlug(p.slug)).toBe(true);
    }
  });
});

describe("página /p/[socio]/[tipo]", () => {
  const fuentePage = fuente("src/app/p/[socio]/[tipo]/page.tsx");

  it("solo exporta lo que Next permite en un page", () => {
    const exportaciones = [
      ...fuentePage.matchAll(
        /^export\s+(?:default\s+)?(?:async\s+)?(?:const|function)\s+(\w+)/gm,
      ),
    ].map((coincidencia) => coincidencia[1]);
    expect(exportaciones.sort()).toEqual([
      "PartnerWidgetPage",
      "generateMetadata",
      "instant",
    ]);
  });

  it("sigue las peculiaridades de Next 16: await connection + instant = false", () => {
    expect(fuentePage).toContain("await connection()");
    expect(fuentePage).toContain("export const instant = false");
  });

  it("muestra la atribución y el aviso legal siempre", () => {
    expect(fuentePage).toContain("Datos de reclu.cl");
    expect(fuentePage).toContain('LegalNotice kind="fintec"');
  });

  it("no consulta datos de InfoProbidad ni promete recomendaciones", () => {
    expect(fuentePage).not.toMatch(/from\s+"@\/lib\/infoprobidad"/);
    expect(fuentePage).not.toMatch(/recomendamos|asesoramiento personalizado/i);
  });

  it("usa el catálogo de F52 y el ranking honesto compartido", () => {
    expect(fuentePage).toContain("rankSources");
    expect(fuentePage).toContain("getBeatTheMarketRanking");
    expect(fuentePage).toContain("filterAllowedPortfolios");
  });

  it("el acento solo se usa como color del socio, no en las cifras", () => {
    // El acento va en el nombre del socio; las cifras usan el verde/rojo
    // del sistema (text-positive / text-negative).
    expect(fuentePage).toContain("style={{ color: partner.accent }}");
    expect(fuentePage).toContain("text-positive");
    expect(fuentePage).toContain("text-negative");
  });
});

describe("migración 041_socios.sql", () => {
  const sql = fuente("supabase/migrations/041_socios.sql");

  it("crea la tabla partners de forma idempotente", () => {
    expect(sql).toContain("create table if not exists public.partners");
    expect(sql).toContain("create index if not exists idx_partners_activo");
  });

  it("usa drop policy if exists antes de crear la política", () => {
    expect(sql).toContain(
      'drop policy if exists "partners public read active" on public.partners;',
    );
    expect(sql).toContain('create policy "partners public read active"');
  });

  it("el seed no rompe al reejecutar", () => {
    expect(sql).toContain("on conflict (slug) do nothing;");
  });

  it("no hay sentencias que rompan al ejecutarla dos veces", () => {
    // Sin 'create table' pelado, sin 'create policy' sin drop previo,
    // sin 'create index' sin if not exists. El único insert lleva
    // 'on conflict do nothing'.
    expect(sql).not.toMatch(/create table public\.partfolios?/);
    expect(sql).not.toMatch(/create index idx_partners_activo/);
    const inserts = [...sql.matchAll(/insert into public\.partfolios?/gi)];
    for (const insert of inserts) {
      const desde = insert.index ?? 0;
      const bloque = sql.slice(desde, desde + 400);
      expect(bloque).toContain("on conflict (slug) do nothing");
    }
  });

  it("la tabla tiene las columnas pedidas", () => {
    for (const columna of [
      "slug text not null unique",
      "nombre text not null",
      "logo_url text",
      "portafolios text[] not null",
      "activo boolean not null default true",
    ]) {
      expect(sql).toContain(columna);
    }
  });

  it("activa RLS y no expone escrituras públicas", () => {
    expect(sql).toContain("alter table public.partners enable row level security;");
    expect(sql).not.toContain("for insert");
    expect(sql).not.toContain("for update");
    expect(sql).not.toContain("for delete");
  });
});
