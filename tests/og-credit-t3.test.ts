import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T3 · B4 — imágenes Open Graph de /planes, /aprende y /metodologia, y
 * crédito de retrato sin doble codificación (mojibake).
 *
 * Solo lee archivos con fs: no importa componentes ni depende del runtime
 * de Next, para que el test no arrastre JSX ni `next/og`.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

const OG_FILES = [
  "src/app/planes/opengraph-image.tsx",
  "src/app/aprende/opengraph-image.tsx",
  "src/app/metodologia/opengraph-image.tsx",
] as const;

const CREDIT_FILE = "src/components/portrait-credit.tsx";

describe("OG de planes, aprende y metodología", () => {
  for (const file of OG_FILES) {
    it(`${file} existe y sigue el patrón de ranking`, () => {
      expect(existsSync(path.join(root, file))).toBe(true);
      const source = read(file);
      expect(source).toContain('from "@/lib/og-card"');
      expect(source).toContain("ogCard(");
      expect(source).toContain("export const size = OG_SIZE;");
      expect(source).toContain('export const contentType = "image/png";');
      expect(source).toContain("export const alt =");
    });
  }

  it("usa los textos reales de cada página", () => {
    const planes = read(OG_FILES[0]);
    expect(planes).toContain('kicker: "Planes"');
    expect(planes).toContain('title: "Planes y precios de Fraccion"');
    expect(planes).toContain('subtitle: "Corredoras gratis · Pro $9.990 al mes"');

    const aprende = read(OG_FILES[1]);
    expect(aprende).toContain('kicker: "Aprende"');
    expect(aprende).toContain('title: "13F, PTR, Form 4 y más, explicados simple"');

    const metodologia = read(OG_FILES[2]);
    expect(metodologia).toContain('kicker: "Metodología"');
    expect(metodologia).toContain('title: "Cómo calculamos cada número"');
  });
});

describe("crédito de retrato sin mojibake", () => {
  it("no contiene caracteres con doble codificación", () => {
    const source = read(CREDIT_FILE);
    // U+00C2 ("A" con circunflejo) es la firma del UTF-8 leído como Latin-1
    // (el separador "·" queda como U+00C2 U+00B7).
    expect(source).not.toContain("\u00C2");
    // U+00C3 ("A" con tilde) delata el resto de las secuencias doble
    // codificadas (é, í, ú, — y compañía mal guardadas).
    expect(source).not.toContain("\u00C3");
    // U+FFFD (carácter de reemplazo) señala bytes rotos al guardar.
    expect(source).not.toContain("\uFFFD");
    expect(source).not.toContain("A\uFFFD");
  });

  it("acredita la licencia con el separador · correcto", () => {
    const source = read(CREDIT_FILE);
    expect(source).toContain("`Foto: ${author} · ${license} · Wikimedia Commons`");
    expect(source).toContain("`Foto: ${license} · Wikimedia Commons`");
    expect(source).toContain('"Foto: retrato oficial, dominio público"');
  });
});
