import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guardia de marca visible: todo lo que lee el usuario dice Fraccion /
 * fraccion.si. Los identificadores internos (`reclu_ref`, eventos SSE
 * "reclu", logs "[reclu]", claves de storage) NO se tocan, así que este test
 * ignora comentarios y formas internas (`reclu-ref`, `recluRef`, `reclu_x`).
 *
 * Se leen las fuentes con fs: no se renderiza React, así que el test no
 * depende del entorno de Next ni de Supabase.
 */

// Raíz del repo deducida de la ubicación de este archivo (tests/), no del cwd:
// corre igual desde la raíz o desde un subdirectorio.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ARCHIVOS = [
  "src/components/logo.tsx",
  "src/components/app/logo-mark.tsx",
  "src/app/planes/page.tsx",
  "src/app/admin/publicaciones/page.tsx",
  "src/components/portfolio-manager.tsx",
];

function fuente(rutaRelativa: string): string {
  return readFileSync(path.join(RAIZ, rutaRelativa), "utf8");
}

/**
 * Quita comentarios conservando los saltos de línea (para que los números de
 * línea del reporte sigan siendo correctos). No toca `https://` porque exige
 * espacio o inicio de línea antes de `//`.
 */
function sinComentarios(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, (comentario) => comentario.replace(/[^\n]/g, ""))
    .replace(/(^|[ \t])\/\/[^\n]*/gm, "$1");
}

/**
 * `reclu` como palabra suelta: lo que se pinta en pantalla, en un `alt`, en un
 * `title` o en metadata. Quedan fuera `reclu.cl`, `@reclu_cl` (se reportan
 * aparte), los identificadores con guion (`reclu-ref`) y camelCase
 * (`recluRef`), y los prefijos internos de log (`[reclu]`).
 */
const RECLU_VISIBLE = /\breclu\b(?!-[A-Za-z0-9])/i;

type Hallazgo = { linea: number; motivo: string; texto: string };

/** Marcas viejas presentes en una fuente, ya sin comentarios. */
function hallazgos(fuenteCruda: string): Hallazgo[] {
  const encontrados: Hallazgo[] = [];

  sinComentarios(fuenteCruda)
    .split("\n")
    .forEach((linea, indice) => {
      const numero = indice + 1;
      const texto = linea.trim();

      if (/reclu\.cl/i.test(linea)) {
        encontrados.push({ linea: numero, motivo: "dominio viejo reclu.cl", texto });
      }
      if (/@reclu_cl/i.test(linea)) {
        encontrados.push({ linea: numero, motivo: "cuenta vieja @reclu_cl", texto });
      }

      // Se enmascaran las formas ya reportadas para no duplicar el hallazgo.
      const resto = linea
        .replace(/@?reclu\.cl/gi, "")
        .replace(/@reclu_cl/gi, "")
        .replace(/\[reclu\]/gi, "");
      if (RECLU_VISIBLE.test(resto)) {
        encontrados.push({ linea: numero, motivo: "texto visible 'reclu'", texto });
      }
    });

  return encontrados;
}

/** Reporte legible: "archivo:línea — motivo → texto". */
function reporte(archivo: string): string {
  return hallazgos(fuente(archivo))
    .map((h) => `${archivo}:${h.linea} — ${h.motivo} → ${h.texto}`)
    .join("\n");
}

describe("marca visible: Fraccion", () => {
  for (const archivo of ARCHIVOS) {
    it(`${archivo} no muestra la marca vieja`, () => {
      expect(reporte(archivo)).toBe("");
    });
  }

  it("las fuentes vigiladas existen y tienen contenido", () => {
    for (const archivo of ARCHIVOS) {
      expect(fuente(archivo).trim().length).toBeGreaterThan(0);
    }
  });

  it("LogoLockup pinta el wordmark de @/lib/brand", () => {
    const logo = fuente("src/components/logo.tsx");
    expect(logo).toMatch(
      /import\s*\{[^}]*\bBRAND_WORDMARK\b[^}]*\}\s*from\s*["']@\/lib\/brand["']/,
    );
    expect(logo).toMatch(/\{BRAND_WORDMARK\}/);
  });

  it("LogoMark es texto: delega en LogoLockup, sin imagen de marca vieja", () => {
    const mark = fuente("src/components/app/logo-mark.tsx");
    expect(mark).toContain("<LogoLockup");
    expect(mark).not.toMatch(/<img\b/i);
  });

  it("brand.ts fija el nombre, el wordmark y el dominio de Fraccion", () => {
    const brand = fuente("src/lib/brand.ts");
    expect(brand).toMatch(/BRAND_NAME\s*=\s*["']Fraccion["']/);
    expect(brand).toMatch(/BRAND_WORDMARK\s*=\s*["']fraccion["']/);
    expect(brand).toMatch(/DEFAULT_BRAND_DOMAIN\s*=\s*["']fraccion\.si["']/);
  });

  it("el detector no se deja engañar por un texto visible suelto", () => {
    expect(hallazgos("<h1>reclu</h1>")).toHaveLength(1);
    expect(hallazgos("<h1>reclu.cl</h1>")).toHaveLength(1);
    expect(hallazgos("fraccion.si @reclu_cl")).toHaveLength(1);
    expect(hallazgos('alt="Reclu"')).toHaveLength(1);
    // Nada que reportar: identificadores internos y comentarios.
    expect(hallazgos("const reclu_ref = 1; // reclu")).toHaveLength(0);
    expect(hallazgos("const recluRef = 1;")).toHaveLength(0);
    expect(hallazgos('console.warn("[reclu] fallo");')).toHaveLength(0);
    expect(hallazgos("/* el logo de Reclu */")).toHaveLength(0);
  });
});
