import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRobots } from "@/app/robots";
import { faqSchema, isIndexableHost, itemListSchema, websiteSchema, withSeo } from "@/lib/seo";

const src = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://reclu.cl"));
afterEach(() => vi.unstubAllEnvs());

describe("indexación por host", () => {
  it("solo el host canónico es indexable", () => {
    expect(isIndexableHost("reclu.cl")).toBe(true);
    expect(isIndexableHost("reclu-amber.vercel.app")).toBe(false);
    expect(isIndexableHost("reclu-prod.vercel.app")).toBe(false);
    expect(isIndexableHost("reclu-git-x.vercel.app")).toBe(false);
    expect(isIndexableHost("www.reclu.cl")).toBe(false);
    expect(isIndexableHost(null)).toBe(false);
  });
  it("vercel.app nunca es indexable aunque sea el host de NEXT_PUBLIC_SITE_URL", () => {
    expect(isIndexableHost("reclu-amber.vercel.app", "reclu-amber.vercel.app")).toBe(false);
  });
  it("robots: Disallow total fuera del host canónico", () => {
    const r = buildRobots("reclu-amber.vercel.app");
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.disallow).toBe("/");
    expect(r.sitemap).toBeUndefined();
  });
  it("robots: rutas privadas bloqueadas en el host canónico", () => {
    const r = buildRobots("reclu.cl");
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    const d = ([] as string[]).concat(rule.disallow ?? []);
    for (const p of ["/app/", "/login", "/api/", "/dashboard"]) expect(d).toContain(p);
    expect(r.sitemap).toBe("https://reclu.cl/sitemap.xml");
  });
  it("next.config agrega X-Robots-Tag noindex por host", () => {
    const cfg = src("next.config.ts");
    expect(cfg).toContain("X-Robots-Tag");
    expect(cfg).toContain("vercel");
    expect(cfg).toContain("missing:");
  });
});

describe("metadata por página", () => {
  it("withSeo pone canonical, og:url y twitter propios", () => {
    const m = withSeo("/explore", { title: "Portafolios", description: "d" });
    expect(m.alternates?.canonical).toBe("/explore");
    expect((m.openGraph as { url?: string }).url).toBe("https://reclu.cl/explore");
    expect(m.openGraph?.title).toBe("Portafolios");
    expect((m.twitter as { card?: string }).card).toBe("summary_large_image");
  });
  it("respeta un canonical explícito", () => {
    expect(withSeo("/a", { alternates: { canonical: "/b" } }).alternates?.canonical).toBe("/b");
  });
  it("el layout raíz ya no fija canonical ni og:url y usa es-CL", () => {
    const l = src("src/app/layout.tsx");
    expect(l).not.toMatch(/canonical:\s*"\/"/);
    expect(l).not.toContain("url: SITE,");
    expect(l).toContain('lang="es-CL"');
  });
  it.each([
    "src/app/explore/page.tsx", "src/app/ranking/page.tsx", "src/app/trump-dice/page.tsx", "src/app/page.tsx",
    "src/app/aprende/page.tsx", "src/app/accion/[symbol]/page.tsx", "src/app/creadores/[alias]/page.tsx",
  ])("%s usa withSeo", (f) => expect(src(f)).toContain("withSeo("));
  it("títulos sin marca repetida", () => {
    expect(src("src/app/portfolio/[slug]/page.tsx")).not.toContain("| Reclu");
    expect(src("src/app/accion/[symbol]/page.tsx")).not.toContain("| Reclu");
  });
  it("notFound real en portfolio, accion y creadores (en generateMetadata)", () => {
    expect(src("src/app/portfolio/[slug]/page.tsx")).toContain("if (!portfolio) notFound();");
    expect(src("src/app/accion/[symbol]/page.tsx")).toMatch(/who === 0 && !overview\.displayName\)\) notFound\(\)/);
    expect(src("src/app/creadores/[alias]/page.tsx")).not.toContain("Creador no encontrado");
  });
  it("hero: solo el hero real lleva h1", () => {
    expect(src("src/components/sections/hero.tsx")).toContain('const Title = loading ? "p" : "h1"');
  });
});

describe("JSON-LD", () => {
  it("WebSite con SearchAction hacia /explore?q=", () => {
    const w = websiteSchema() as { potentialAction: { target: { urlTemplate: string } } };
    expect(w.potentialAction.target.urlTemplate).toBe("https://reclu.cl/explore?q={search_term_string}");
  });
  it("ItemList y FAQPage", () => {
    const l = itemListSchema("x", [{ name: "a" }, { name: "b", url: "u" }]) as { itemListElement: { position: number }[] };
    expect(l.itemListElement[1].position).toBe(2);
    const f = faqSchema([{ q: "¿?", a: "sí" }]) as { "@type": string; mainEntity: unknown[] };
    expect(f["@type"]).toBe("FAQPage");
    expect(f.mainEntity).toHaveLength(1);
  });
  it("layout, explore, ranking y faq insertan JsonLd", () => {
    expect(src("src/app/layout.tsx")).toContain("websiteSchema()");
    expect(src("src/app/explore/page.tsx")).toContain("itemListSchema(");
    expect(src("src/app/ranking/page.tsx")).toContain("itemListSchema(");
    expect(src("src/components/sections/faq.tsx")).toContain("faqSchema(FAQ_ITEMS)");
  });
});