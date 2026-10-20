import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sitemap: rutas estáticas nuevas y las dos rutas que dependen de flags
 * (`/api-docs` con API_PUBLIC_ENABLED y `/creadores` con COMMUNITY_ENABLED).
 *
 * Sin red ni Supabase: `getPortfolios` se reemplaza por un doble mínimo.
 * Los flags se leen en cada llamada, no al importar el módulo.
 */

vi.mock("@/lib/queries", () => ({
  getPortfolios: async () => [
    {
      slug: "pelosi-tracker",
      name: "Pelosi Tracker",
      updated_at: "2026-10-20T12:00:00Z",
    },
  ],
}));

import sitemap from "@/app/sitemap";
import { FICHAS_APRENDE } from "@/content/aprende";

const ORIGINAL_API_FLAG = process.env.API_PUBLIC_ENABLED;
const ORIGINAL_COMMUNITY_FLAG = process.env.COMMUNITY_ENABLED;

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function paths(entries: Awaited<ReturnType<typeof sitemap>>): string[] {
  return entries
    .map((entry) => new URL(entry.url).pathname)
    .sort();
}

beforeEach(() => {
  delete process.env.API_PUBLIC_ENABLED;
  delete process.env.COMMUNITY_ENABLED;
});

afterEach(() => {
  restore("API_PUBLIC_ENABLED", ORIGINAL_API_FLAG);
  restore("COMMUNITY_ENABLED", ORIGINAL_COMMUNITY_FLAG);
});

describe("sitemap", () => {
  it("lista ranking, aprende, herramientas y medios", async () => {
    const list = paths(await sitemap());

    expect(list).toContain("/ranking");
    expect(list).toContain("/aprende");
    expect(list).toContain("/herramientas");
    expect(list).toContain("/herramientas/backtest");
    expect(list).toContain("/herramientas/impuestos");
    expect(list).toContain("/medios");
    for (const ficha of FICHAS_APRENDE) {
      expect(list).toContain(`/aprende/${ficha.slug}`);
    }
  });

  it("incluye los portafolios activos y no repite rutas", async () => {
    const list = paths(await sitemap());

    expect(list).toContain("/portfolio/pelosi-tracker");
    expect(new Set(list).size).toBe(list.length);
  });

  it("apagado por defecto: sin /api-docs ni /creadores", async () => {
    const list = paths(await sitemap());

    expect(list).not.toContain("/api-docs");
    expect(list).not.toContain("/creadores");
  });

  it("API_PUBLIC_ENABLED=true agrega /api-docs y no /creadores", async () => {
    process.env.API_PUBLIC_ENABLED = "true";
    const list = paths(await sitemap());

    expect(list).toContain("/api-docs");
    expect(list).not.toContain("/creadores");
  });

  it("COMMUNITY_ENABLED=true agrega /creadores y no /api-docs", async () => {
    process.env.COMMUNITY_ENABLED = "true";
    const list = paths(await sitemap());

    expect(list).toContain("/creadores");
    expect(list).not.toContain("/api-docs");
  });

  it("con ambos flags en true agrega las dos rutas", async () => {
    process.env.API_PUBLIC_ENABLED = "true";
    process.env.COMMUNITY_ENABLED = "true";
    const list = paths(await sitemap());

    expect(list).toContain("/api-docs");
    expect(list).toContain("/creadores");
  });

  it("falla cerrado: solo el valor exacto 'true' enciende las rutas", async () => {
    for (const value of ["TRUE", "1", "yes", ""]) {
      process.env.API_PUBLIC_ENABLED = value;
      process.env.COMMUNITY_ENABLED = value;
      const list = paths(await sitemap());

      expect(list, `flag=${value}`).not.toContain("/api-docs");
      expect(list, `flag=${value}`).not.toContain("/creadores");
    }
  });
});
