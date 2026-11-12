import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPartnerPathGate,
  isUnknownPartnerPath,
  partnerPathFromPath,
} from "@/lib/partner-path-gate";

/**
 * B1/T3 — gate de /p/<socio>/<tipo> en el proxy.
 *
 * `tipo` se valida en local con el mismo helper que la página; el socio se
 * busca en la lista de socios activos (lectura pública, caché 5 min). Ante
 * cualquier duda —error, timeout, lista vacía, sin Supabase— NO bloquea.
 */

const state = vi.hoisted(() => ({
  slugs: [] as string[],
  fail: false,
  calls: [] as string[],
}));

function installFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      state.calls.push(`${url.pathname}${url.search}`);
      if (state.fail) throw new Error("red");
      if (url.pathname.endsWith("/rest/v1/partners")) {
        return new Response(
          JSON.stringify(state.slugs.map((slug) => ({ slug }))),
          { status: 200 },
        );
      }
      return new Response("[]", { status: 200 });
    }),
  );
}

const env = { ...process.env };

beforeEach(() => {
  __resetPartnerPathGate();
  state.slugs = [];
  state.fail = false;
  state.calls = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://demo.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  installFetch();
});

afterEach(() => {
  process.env = { ...env };
  vi.unstubAllGlobals();
});

describe("partnerPathFromPath", () => {
  it("solo toma /p/<socio>/<tipo>", () => {
    expect(partnerPathFromPath("/p/demo/portafolios")).toEqual({
      socio: "demo",
      tipo: "portafolios",
    });
    expect(partnerPathFromPath("/p/renta-4/ranking/")).toEqual({
      socio: "renta-4",
      tipo: "ranking",
    });
    expect(partnerPathFromPath("/p/demo")).toBeNull();
    expect(partnerPathFromPath("/p/a/b/c")).toBeNull();
    expect(partnerPathFromPath("/p")).toBeNull();
    expect(partnerPathFromPath("/portfolio/demo")).toBeNull();
  });
});

describe("isUnknownPartnerPath", () => {
  it("un socio activo con un tipo válido pasa", async () => {
    state.slugs = ["demo", "renta-4"];
    expect(await isUnknownPartnerPath("demo", "portafolios")).toBe(false);
    expect(await isUnknownPartnerPath("renta-4", "ranking")).toBe(false);
  });

  it("normaliza el socio igual que la página", async () => {
    state.slugs = ["demo"];
    expect(await isUnknownPartnerPath("Demo", "ranking")).toBe(false);
  });

  it("un socio que no está en la lista da 404", async () => {
    state.slugs = ["demo"];
    expect(await isUnknownPartnerPath("otro-socio", "portafolios")).toBe(true);
  });

  it("un tipo fuera del catálogo da 404 sin consultar la base", async () => {
    state.slugs = ["demo"];
    expect(await isUnknownPartnerPath("demo", "otro-tipo")).toBe(true);
    expect(await isUnknownPartnerPath("demo", "Portafolios")).toBe(true);
    expect(state.calls).toHaveLength(0);
  });

  it("un slug con formato inválido da 404 sin consultar la base", async () => {
    state.slugs = ["demo"];
    expect(await isUnknownPartnerPath("con espacio", "ranking")).toBe(true);
    expect(await isUnknownPartnerPath("Mayúsculas!", "ranking")).toBe(true);
    expect(state.calls).toHaveLength(0);
  });

  it("lista vacía deja pasar", async () => {
    expect(await isUnknownPartnerPath("otro-socio", "portafolios")).toBe(false);
  });

  it("un error de red deja pasar", async () => {
    state.slugs = ["demo"];
    state.fail = true;
    expect(await isUnknownPartnerPath("otro-socio", "portafolios")).toBe(false);
  });

  it("sin Supabase configurado deja pasar", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    expect(await isUnknownPartnerPath("otro-socio", "portafolios")).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it("cachea la lista de socios entre llamadas", async () => {
    state.slugs = ["demo"];
    await isUnknownPartnerPath("demo", "ranking");
    const calls = state.calls.length;
    await isUnknownPartnerPath("otro-socio", "ranking");
    expect(state.calls.length).toBe(calls);
  });
});
