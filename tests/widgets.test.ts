import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONSENSO_AS_OF,
  CONSENSO_SEMILLA,
  WIDGET_META,
  WIDGET_TIPOS,
  formatShortDate,
  isWidgetTipo,
  widgetIframeCode,
  type WidgetTipo,
} from "@/lib/widgets";

const raiz = process.cwd();

function fuente(rutaRelativa: string): string {
  return readFileSync(path.join(raiz, rutaRelativa), "utf8");
}

describe("catálogo de widgets", () => {
  it("define exactamente los cuatro tipos pedidos", () => {
    expect([...WIDGET_TIPOS]).toEqual([
      "consenso-corredoras",
      "afp",
      "insiders",
      "ranking",
    ]);
  });

  it("cada tipo tiene metadatos completos y altura razonable", () => {
    for (const tipo of WIDGET_TIPOS) {
      const meta = WIDGET_META[tipo];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.title.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(20);
      expect(meta.height).toBeGreaterThanOrEqual(300);
      expect(meta.height).toBeLessThanOrEqual(600);
    }
  });

  it("los textos van en español y no prometen recomendaciones", () => {
    for (const tipo of WIDGET_TIPOS) {
      const textos = [
        WIDGET_META[tipo].label,
        WIDGET_META[tipo].title,
        WIDGET_META[tipo].description,
      ];
      for (const texto of textos) {
        expect(texto).not.toMatch(/\b(buy|sell|recommend)\b/i);
      }
    }
  });
});

describe("isWidgetTipo", () => {
  it("acepta los cuatro tipos", () => {
    for (const tipo of WIDGET_TIPOS) {
      expect(isWidgetTipo(tipo)).toBe(true);
    }
  });

  it("rechaza cualquier otra cosa con notFound en la página", () => {
    for (const valor of ["", "peleos", "congreso", "AFP ", "ranking/afp"]) {
      expect(isWidgetTipo(valor)).toBe(false);
    }
  });

  it("rechaza parámetros con caracteres raros o intentos de inyección", () => {
    const valores = [
      "ranking?x=1",
      "ranking&afp",
      "ranking#top",
      "ranking%2Fafp",
      "ranking/../afp",
      "ranking\\afp",
      "ranking%00",
      "ranking\u0000",
      "<script>alert(1)</script>",
      "RANKING",
      " ranking",
      "ranking ",
    ];
    for (const valor of valores) {
      expect(isWidgetTipo(valor)).toBe(false);
    }
  });
});

describe("widgetIframeCode", () => {
  it("genera el iframe con la URL, altura y atribución correctas", () => {
    const codigo = widgetIframeCode("insiders", "https://app.reclu.cl");
    expect(codigo).toBe(
      `<iframe src="https://app.reclu.cl/embed/widget/insiders" width="100%" height="400" style="border:0" title="Datos de fraccion.si" loading="lazy"></iframe>`,
    );
  });

  it("usa la altura declarada en el catálogo", () => {
    for (const tipo of WIDGET_TIPOS) {
      const codigo = widgetIframeCode(tipo, "https://app.reclu.cl");
      expect(codigo).toContain(`height="${WIDGET_META[tipo].height}"`);
    }
  });

  it("la atribución va dentro del propio iframe", () => {
    for (const tipo of WIDGET_TIPOS) {
      const codigo = widgetIframeCode(tipo, "https://app.reclu.cl");
      expect(codigo).toContain('title="Datos de fraccion.si"');
    }
  });

  it("normaliza la base: quita slashes finales y añade https si falta", () => {
    const conSlash = widgetIframeCode("afp", "https://app.reclu.cl/");
    expect(conSlash).toContain('src="https://app.reclu.cl/embed/widget/afp"');
  });

  it("solo apunta a rutas /embed/widget, nunca al resto del sitio", () => {
    for (const tipo of WIDGET_TIPOS) {
      const codigo = widgetIframeCode(tipo, "https://app.reclu.cl");
      expect(codigo).toMatch(/src="https:\/\/app\.reclu\.cl\/embed\/widget\//);
    }
  });
});

describe("semilla pública del consenso (fallback sin Supabase)", () => {
  it("tiene cinco filas con símbolo, nombre y peso", () => {
    expect(CONSENSO_SEMILLA).toHaveLength(5);
    for (const fila of CONSENSO_SEMILLA) {
      expect(fila.symbol.length).toBeGreaterThan(0);
      expect(fila.name.length).toBeGreaterThan(0);
      expect(fila.weight).toBeGreaterThan(0);
    }
  });

  it("los pesos ordenan de mayor a menor y no superan 100%", () => {
    const pesos = CONSENSO_SEMILLA.map((fila) => fila.weight);
    expect([...pesos].sort((a, b) => b - a)).toEqual(pesos);
    const suma = pesos.reduce((total, peso) => total + peso, 0);
    expect(suma).toBeLessThanOrEqual(100);
  });

  it("declara la fecha de corte en formato ISO", () => {
    expect(CONSENSO_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatShortDate", () => {
  it("convierte ISO a DD-MM-AAAA", () => {
    expect(formatShortDate("2026-10-05")).toBe("05-10-2026");
    expect(formatShortDate("2026-10-05T12:00:00Z")).toBe("05-10-2026");
  });

  it("devuelve la entrada tal cual si no es una fecha ISO", () => {
    expect(formatShortDate("corte actual")).toBe("corte actual");
    expect(formatShortDate("")).toBe("");
  });
});

describe("página del widget (/embed/widget/[tipo])", () => {
  const fuentePage = fuente("src/app/embed/widget/[tipo]/page.tsx");

  it("solo exporta lo que Next permite en un page", () => {
    const exportaciones = [
      ...fuentePage.matchAll(
        /^export\s+(?:default\s+)?(?:async\s+)?(?:const|function)\s+(\w+)/gm,
      ),
    ].map((coincidencia) => coincidencia[1]);
    expect(exportaciones.sort()).toEqual([
      "WidgetPage",
      "generateMetadata",
      "instant",
    ]);
  });

  it("sigue las peculiaridades de Next 16: await connection + instant = false", () => {
    expect(fuentePage).toContain("await connection()");
    expect(fuentePage).toContain('export const instant = false');
  });

  it("marca el embed como no indexeable", () => {
    expect(fuentePage).toContain("robots: { index: false }");
  });

  it("muestra la atribución y no consulta datos de InfoProbidad", () => {
    expect(fuentePage).toContain("Datos de fraccion.si");
    expect(fuentePage).not.toMatch(/from\s+"@\/lib\/infoprobidad"/);
  });
});

describe("página /medios", () => {
  const fuenteMedios = fuente("src/app/medios/page.tsx");

  it("muestra los cuatro widgets con su código de iframe", () => {
    expect(fuenteMedios).toContain("WIDGET_TIPOS.map");
    expect(fuenteMedios).toContain("widgetIframeCode");
    expect(fuenteMedios).toContain("WidgetEmbedCode");
  });

  it("incluye las condiciones de uso con la atribución pedida", () => {
    expect(fuenteMedios).toContain("Condiciones de uso");
    expect(fuenteMedios).toContain("Datos de fraccion.si");
    expect(fuenteMedios).toContain("5 U.S.C. § 13107");
    expect(fuenteMedios).toContain("21.521");
  });

  it("usa el aviso legal de Fintec y no consulta datos de InfoProbidad", () => {
    expect(fuenteMedios).toContain('LegalNotice kind="fintec"');
    expect(fuenteMedios).not.toMatch(/from\s+"@\/lib\/infoprobidad"/);
  });
});

describe("CSP: solo /embed puede ir en iframes", () => {
  const fuenteConfig = fuente("next.config.ts");

  it("mantiene frame-ancestors 'none' para el resto del sitio", () => {
    expect(fuenteConfig).toContain("\"frame-ancestors 'none'\"");
  });

  it("abre frame-ancestors solo para /embed/:path*", () => {
    expect(fuenteConfig).toContain("source: \"/embed/:path*\"");
    expect(fuenteConfig).toContain("\"frame-ancestors *;\"");
  });
});
