import { describe, expect, it } from "vitest";
import { FICHAS_APRENDE, fichaPorSlug } from "@/content/aprende";

const SLUGS_ESPERADOS = [
  "13f",
  "form-4",
  "ptr-stock-act",
  "oge-278-t",
  "hecho-esencial",
  "afp-multifondos",
  "infoprobidad",
  "sesgos",
  "ley-fintec",
  "dj-1929",
];

describe("fichas de /aprende", () => {
  it("publica las diez fichas pedidas, con slug único", () => {
    expect(FICHAS_APRENDE.map((ficha) => ficha.slug)).toEqual(SLUGS_ESPERADOS);
    expect(new Set(SLUGS_ESPERADOS).size).toBe(SLUGS_ESPERADOS.length);
  });

  it("no deja ninguna ficha sin fuentes", () => {
    for (const ficha of FICHAS_APRENDE) {
      expect(ficha.fuentes.length, ficha.slug).toBeGreaterThan(0);
      expect(ficha.titulo.trim().length, ficha.slug).toBeGreaterThan(0);
      expect(ficha.resumen.trim().length, ficha.slug).toBeGreaterThan(0);
      expect(ficha.cuerpo.length, ficha.slug).toBeGreaterThan(0);
      for (const parrafo of ficha.cuerpo) {
        expect(parrafo.trim().length, ficha.slug).toBeGreaterThan(0);
      }
      for (const fuente of ficha.fuentes) {
        expect(fuente.titulo.trim().length, `${ficha.slug} fuente`).toBeGreaterThan(0);
        expect(fuente.url, `${ficha.slug} ${fuente.titulo}`).toMatch(/^https:\/\//);
      }
    }
  });

  it("encuentra una ficha por slug y no inventa las que faltan", () => {
    expect(fichaPorSlug("dj-1929")?.titulo).toMatch(/1929/);
    expect(fichaPorSlug("no-existe")).toBeUndefined();
  });
});
