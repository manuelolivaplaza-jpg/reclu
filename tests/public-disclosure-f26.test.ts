import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PUBLIC_DISCLOSURE_SOURCES,
  isPublicDisclosureSource,
} from "@/lib/public-disclosure";

/**
 * F26B: NANC y GOP son un ETF (producto comercial, holdings del N-PORT),
 * no una declaración oficial. Van detrás del muro. Los PTR y el OGE 278-T
 * siguen gratis por 5 U.S.C. § 13107.
 */
describe("F26B: excepción legal del muro", () => {
  it("nport_subversive no es fuente pública", () => {
    expect(isPublicDisclosureSource("nport_subversive")).toBe(false);
  });

  it("las declaraciones oficiales siguen fuera del muro", () => {
    for (const source of ["oge_278t", "house_ptr", "senate_ptr"]) {
      expect(isPublicDisclosureSource(source)).toBe(true);
    }
  });

  it("la lista exenta es exactamente PTR + OGE", () => {
    expect([...PUBLIC_DISCLOSURE_SOURCES]).toEqual([
      "oge_278t",
      "house_ptr",
      "senate_ptr",
    ]);
  });

  it("null y undefined no son fuente pública", () => {
    expect(isPublicDisclosureSource(null)).toBe(false);
    expect(isPublicDisclosureSource(undefined)).toBe(false);
    expect(isPublicDisclosureSource("")).toBe(false);
  });
});

describe("F26B: migración 026 deja NANC/GOP premium", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "026_etf_politicos.sql"),
    "utf8",
  )
    .replace(/\r\n/g, "\n")
    .toLowerCase();

  function tuple(slug: string): string {
    const inicio = sql.indexOf(`'${slug}'`);
    expect(inicio).toBeGreaterThan(-1);
    const fin = sql.indexOf("),", inicio);
    return sql.slice(inicio, fin);
  }

  it("ambos portafolios nacen premium", () => {
    for (const slug of ["nanc-etf", "gop-etf"]) {
      const fila = tuple(slug);
      expect(fila).toContain("'nport_subversive'");
      expect(fila).toMatch(/\n\s*true,\n\s*array\[/);
    }
  });

  it("corrige filas existentes con premium = false", () => {
    expect(sql).toContain("on conflict (slug) do update set premium = true");
    expect(sql).not.toContain("do nothing");
  });

  it("el comentario legal explica que es un ETF premium, no un PTR", () => {
    expect(sql).toContain("producto comercial");
    expect(sql).toContain("n-port");
    expect(sql).toContain("house_ptr");
    expect(sql).toContain("senate_ptr");
    expect(sql).toContain("oge_278t");
  });
});
