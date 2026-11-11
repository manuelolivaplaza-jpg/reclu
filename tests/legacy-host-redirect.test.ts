import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLegacyHostRedirects, escapeHostPattern } from "@/lib/host-redirects";

/**
 * B7 / T3 — cambio de dominio a fraccion.si.
 *
 * La función pura recibe la URL y la lista de hosts como parámetros (no lee
 * `process.env`): así se puede ejercitar sin depender del entorno. En
 * `next.config.ts` sí se leen las variables y se le pasan.
 */
const SITE = "https://fraccion.si";

describe("buildLegacyHostRedirects: fail closed", () => {
  it("sin NEXT_PUBLIC_SITE_URL no hay ninguna regla", () => {
    expect(buildLegacyHostRedirects("", "reclu-prod.vercel.app")).toEqual([]);
    expect(buildLegacyHostRedirects("   ", "reclu-prod.vercel.app")).toEqual([]);
    expect(buildLegacyHostRedirects(null, "reclu-prod.vercel.app")).toEqual([]);
    expect(buildLegacyHostRedirects(undefined, "reclu-prod.vercel.app")).toEqual([]);
  });

  it("sin LEGACY_HOSTS no hay ninguna regla", () => {
    expect(buildLegacyHostRedirects(SITE, "")).toEqual([]);
    expect(buildLegacyHostRedirects(SITE, "   ")).toEqual([]);
    expect(buildLegacyHostRedirects(SITE, " , ,")).toEqual([]);
    expect(buildLegacyHostRedirects(SITE, null)).toEqual([]);
    expect(buildLegacyHostRedirects(SITE, undefined)).toEqual([]);
  });

  it("una URL de sitio inválida tampoco genera reglas", () => {
    expect(buildLegacyHostRedirects("esto no es una url", "reclu-prod.vercel.app")).toEqual([]);
    expect(buildLegacyHostRedirects("ftp://fraccion.si", "reclu-prod.vercel.app")).toEqual([]);
  });
});

describe("buildLegacyHostRedirects: regla generada", () => {
  it("una regla permanente por host, con la ruta preservada y el host escapado", () => {
    expect(buildLegacyHostRedirects(SITE, "reclu-prod.vercel.app, www.fraccion.si")).toEqual([
      {
        source: "/:path*",
        destination: "https://fraccion.si/:path*",
        permanent: true,
        has: [{ type: "host", value: "reclu-prod\\.vercel\\.app" }],
      },
      {
        source: "/:path*",
        destination: "https://fraccion.si/:path*",
        permanent: true,
        has: [{ type: "host", value: "www\\.fraccion\\.si" }],
      },
    ]);
  });

  it("acepta NEXT_PUBLIC_SITE_URL sin protocolo y normaliza el destino", () => {
    const rules = buildLegacyHostRedirects("fraccion.si/", "reclu-prod.vercel.app");
    expect(rules).toHaveLength(1);
    expect(rules[0].destination).toBe("https://fraccion.si/:path*");
  });

  it("respeta http:// si la variable lo trae", () => {
    const rules = buildLegacyHostRedirects("http://localhost:3000", "reclu-prod.vercel.app");
    expect(rules[0].destination).toBe("http://localhost:3000/:path*");
  });

  it("ignora espacios, mayúsculas y duplicados", () => {
    const rules = buildLegacyHostRedirects(
      SITE,
      " RECLU-PROD.VERCEL.APP , reclu-prod.vercel.app , ",
    );
    expect(rules).toHaveLength(1);
    expect(rules[0].has[0].value).toBe("reclu-prod\\.vercel\\.app");
  });

  it("quita el puerto: Next compara contra el hostname sin puerto", () => {
    const rules = buildLegacyHostRedirects(SITE, "reclu-prod.vercel.app:443");
    expect(rules).toHaveLength(1);
    expect(rules[0].has[0].value).toBe("reclu-prod\\.vercel\\.app");
  });

  it("no redirige el propio host canónico (evita el bucle)", () => {
    expect(buildLegacyHostRedirects(SITE, "fraccion.si")).toEqual([]);
    expect(buildLegacyHostRedirects(SITE, "fraccion.si,reclu-prod.vercel.app")).toHaveLength(1);
  });

  it("escapeHostPattern escapa todos los meta-caracteres de regex", () => {
    expect(escapeHostPattern("www.fraccion.si")).toBe("www\\.fraccion\\.si");
    expect(escapeHostPattern("a+b(c)?")).toBe("a\\+b\\(c\\)\\?");
  });
});

describe("buildLegacyHostRedirects: reclu.cl nunca se redirige", () => {
  it("excluye reclu.cl cuando es el único host", () => {
    expect(buildLegacyHostRedirects(SITE, "reclu.cl")).toEqual([]);
  });

  it("excluye www.reclu.cl y cualquier subdominio", () => {
    expect(buildLegacyHostRedirects(SITE, "www.reclu.cl,app.reclu.cl,blog.reclu.cl")).toEqual([]);
  });

  it("lo excluye aunque venga mezclado con hosts válidos", () => {
    const rules = buildLegacyHostRedirects(
      SITE,
      "reclu.cl,reclu-prod.vercel.app,www.reclu.cl",
    );
    expect(rules.map((rule) => rule.has[0].value)).toEqual(["reclu-prod\\.vercel\\.app"]);
  });

  it("tampoco emite reglas si el destino todavía es reclu.cl", () => {
    // Evita un 308 permanente hacia el otro negocio por una variable sin migrar.
    expect(buildLegacyHostRedirects("https://reclu.cl", "reclu-prod.vercel.app")).toEqual([]);
    expect(buildLegacyHostRedirects("https://www.reclu.cl", "reclu-prod.vercel.app")).toEqual([]);
  });
});

describe("next.config cablea las variables de dominio", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("con NEXT_PUBLIC_SITE_URL y LEGACY_HOSTS agrega los 308 por host", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://fraccion.si");
    vi.stubEnv("LEGACY_HOSTS", "reclu-prod.vercel.app,www.fraccion.si");
    const { default: nextConfig } = await import("../next.config");
    const redirects = await (nextConfig.redirects?.() ?? []);
    const hostRules = redirects.filter((rule) => rule.source === "/:path*");

    expect(hostRules).toEqual([
      {
        source: "/:path*",
        destination: "https://fraccion.si/:path*",
        permanent: true,
        has: [{ type: "host", value: "reclu-prod\\.vercel\\.app" }],
      },
      {
        source: "/:path*",
        destination: "https://fraccion.si/:path*",
        permanent: true,
        has: [{ type: "host", value: "www\\.fraccion\\.si" }],
      },
    ]);
  });

  it("sin NEXT_PUBLIC_SITE_URL no agrega reglas de host", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("LEGACY_HOSTS", "reclu-prod.vercel.app");
    const { default: nextConfig } = await import("../next.config");
    const redirects = await (nextConfig.redirects?.() ?? []);

    expect(redirects.filter((rule) => rule.source === "/:path*")).toHaveLength(0);
  });
});
