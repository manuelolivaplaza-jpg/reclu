import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { articleSchema, breadcrumbSchema } from "@/lib/seo";
import { siteUrl } from "@/lib/site";
import { AVISO_APRENDE, FICHAS_APRENDE, fichaPorSlug } from "@/content/aprende";

const src = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const SIN_MURO = "sin muro";

/** Rutas de valores vacíos (string en blanco, arreglo u objeto sin contenido). */
function vacios(valor: unknown, ruta = "$"): string[] {
  if (typeof valor === "string") return valor.trim() ? [] : [ruta];
  if (Array.isArray(valor)) {
    return valor.length === 0 ? [ruta] : valor.flatMap((v, i) => vacios(v, `${ruta}[${i}]`));
  }
  if (valor && typeof valor === "object") {
    const entradas = Object.entries(valor as Record<string, unknown>);
    if (entradas.length === 0) return [ruta];
    return entradas.flatMap(([k, v]) => vacios(v, `${ruta}.${k}`));
  }
  return [];
}

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://fraccion.si"));
afterEach(() => vi.unstubAllEnvs());

describe("articleSchema", () => {
  it("usa siteUrl(), el Organization del layout y es-CL", () => {
    const a = articleSchema({
      headline: "Formulario 13F",
      description: "d",
      url: "/aprende/13f",
      datePublished: "2026-01-02",
    }) as Record<string, unknown>;
    expect(a["@type"]).toBe("Article");
    expect(a.url).toBe(`${siteUrl()}/aprende/13f`);
    expect(a.inLanguage).toBe("es-CL");
    expect(a.author).toEqual({ "@id": `${siteUrl()}/#organization` });
    expect(a.publisher).toEqual({ "@id": `${siteUrl()}/#organization` });
    expect(a.datePublished).toBe("2026-01-02");
    expect(vacios(a)).toEqual([]);
  });

  it("no inventa fechas: las omite si no vienen", () => {
    const a = articleSchema({ headline: "h", description: "d", url: "/x" });
    expect(a).not.toHaveProperty("datePublished");
    expect(a).not.toHaveProperty("dateModified");
    expect(vacios(a)).toEqual([]);
  });

  it("acepta una URL absoluta sin duplicar el dominio", () => {
    const a = articleSchema({ headline: "h", description: "d", url: "https://fraccion.si/x" });
    expect(a.url).toBe("https://fraccion.si/x");
  });
});

describe("breadcrumbSchema", () => {
  it("numera desde 1 y emite item absoluto por ruta interna", () => {
    const b = breadcrumbSchema([
      { name: "Inicio", path: "/" },
      { name: "Aprende", path: "/aprende" },
      { name: "Formulario 13F", path: "/aprende/13f" },
    ]) as { itemListElement: { position: number; item: string; name: string }[] };
    expect(b.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(b.itemListElement[1].item).toBe(`${siteUrl()}/aprende`);
    expect(vacios(b)).toEqual([]);
  });
});

describe("/aprende/[slug]: Article + Breadcrumb + FAQ", () => {
  const pagina = src("src/app/aprende/[slug]/page.tsx");

  it("la página renderiza el resumen que usa la FAQPage", () => {
    // Sin resumen visible no hay FAQ; con resumen visible, el schema usa ese texto.
    expect(pagina).toContain("{ficha.resumen}");
    expect(pagina).toMatch(/faqSchema\(\[\{\s*q:/);
    expect(pagina).toContain("a: ficha.resumen");
    expect(pagina).toMatch(/¿Qué es \$\{ficha\.titulo\}\?/);
  });

  it("emite Article y BreadcrumbList sin fechas inventadas", () => {
    expect(pagina).toContain("articleSchema({");
    expect(pagina).toContain("breadcrumbSchema([");
    expect(pagina).not.toContain("datePublished");
    expect(pagina).toContain('{ name: "Aprende", path: "/aprende" }');
  });

  it("la FAQ de cada ficha coincide con su resumen y no agrega datos", () => {
    for (const ficha of FICHAS_APRENDE) {
      const q = `¿Qué es ${ficha.titulo}?`;
      expect(q).toContain(ficha.titulo);
      expect(ficha.resumen.trim().length).toBeGreaterThan(0);
      // La misma pareja q/a se arma con la ficha en la página (ver arriba).
      expect(ficha.resumen).not.toContain(SIN_MURO);
    }
  });
});

describe("/aprende: ItemList de las fichas", () => {
  const pagina = src("src/app/aprende/page.tsx");

  it("lista todas las fichas con su URL canónica", () => {
    expect(pagina).toContain("itemListSchema(");
    expect(pagina).toContain("FICHAS_APRENDE.map((ficha) => ({");
    expect(pagina).toContain("absoluteUrl(`/aprende/${ficha.slug}`)");
  });
});

describe("/metodologia: layout con Article, sin FAQ", () => {
  const layout = src("src/app/metodologia/layout.tsx");
  const pagina = src("src/app/metodologia/page.tsx");

  it("renderiza children y Article + BreadcrumbList", () => {
    expect(layout).toContain("{children}");
    expect(layout).toContain("articleSchema({");
    expect(layout).toContain("breadcrumbSchema([");
    expect(layout).toContain('headline: "Metodología"');
    expect(layout).toContain('url: "/metodologia"');
  });

  it("no emite FAQPage en metodología", () => {
    expect(layout).not.toContain("faqSchema");
    expect(layout).not.toContain("FAQPage");
  });

  it("la description copia la metadata real de la página", () => {
    const m = pagina.match(/description:\s*"([^"]+)"/);
    const descripcion = m?.[1];
    expect(descripcion?.length ?? 0).toBeGreaterThan(0);
    expect(layout).toContain(descripcion ?? "\u0000");
  });
});

describe("decisión A (D55): políticos y funcionarios solo para suscriptores", () => {
  it("el aviso de /aprende ya no promete acceso sin muro", () => {
    expect(AVISO_APRENDE).not.toContain(SIN_MURO);
    expect(AVISO_APRENDE).toContain(
      "Las posiciones de políticos y funcionarios de Estados Unidos (informes PTR y OGE 278-T) son solo para suscriptores.",
    );
    expect(AVISO_APRENDE).toContain("no ejecuta órdenes");
    expect(AVISO_APRENDE).toContain("leyes 19.628 y 21.719");
  });

  it("la ficha PTR corrige la última frase del párrafo legal", () => {
    const ptr = fichaPorSlug("ptr-stock-act");
    const parrafo = ptr?.cuerpo.find((p) => p.includes("cargo razonable"));
    expect(parrafo).toBeDefined();
    expect(parrafo).toContain(
      "En Fraccion, las posiciones que salen de estos informes son solo para suscriptores.",
    );
    expect(parrafo).not.toContain(SIN_MURO);
    for (const p of ptr?.cuerpo ?? []) expect(p).not.toContain(SIN_MURO);
  });

  it("el comentario de cabecera de aprende.ts no repite la política vieja", () => {
    expect(src("src/content/aprende.ts")).not.toContain(SIN_MURO);
  });
});

describe("portafolios relacionados", () => {
  it("cada slug es válido, existe en la lista y no se repite", () => {
    const vistos = new Set<string>();
    for (const ficha of FICHAS_APRENDE) {
      for (const slug of ficha.portafolios ?? []) {
        expect(slug, ficha.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i);
        expect(vistos.has(slug), slug).toBe(false);
        vistos.add(slug);
      }
    }
  });

  it("las fichas sin relación declarada no inventan portafolios", () => {
    for (const slug of ["sesgos", "ley-fintec", "dj-1929"]) {
      expect(fichaPorSlug(slug)?.portafolios, slug).toBeUndefined();
    }
  });

  it("la página renderiza el bloque solo si hay portafolios", () => {
    const pagina = src("src/app/aprende/[slug]/page.tsx");
    expect(pagina).toContain("Portafolios relacionados");
    expect(pagina).toContain("href={`/portfolio/${portafolio}`}");
  });
});
