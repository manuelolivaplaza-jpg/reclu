import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPortfolioSlugGate,
  isUnknownPortfolioSlug,
  portfolioSlugFromPath,
} from "@/lib/portfolio-slug-gate";

describe("portfolioSlugFromPath", () => {
  it("solo toma /portfolio/<slug> de un segmento", () => {
    expect(portfolioSlugFromPath("/portfolio/berkshire-hathaway")).toBe("berkshire-hathaway");
    expect(portfolioSlugFromPath("/portfolio/berkshire-hathaway/")).toBe("berkshire-hathaway");
    expect(portfolioSlugFromPath("/portfolio/x/opengraph-image")).toBeNull();
    expect(portfolioSlugFromPath("/app/portafolio/x")).toBeNull();
    expect(portfolioSlugFromPath("/portfolio")).toBeNull();
  });
});

describe("isUnknownPortfolioSlug", () => {
  const env = { ...process.env };
  beforeEach(() => {
    __resetPortfolioSlugGate();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://demo.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("404 solo si la lista de activos llegó y el slug no está", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([{ slug: "berkshire-hathaway" }]), { status: 200 })),
    );
    expect(await isUnknownPortfolioSlug("berkshire-hathaway")).toBe(false);
    expect(await isUnknownPortfolioSlug("slug-inexistente")).toBe(true);
  });

  it("los slugs ocultos con redirección nunca son 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    expect(await isUnknownPortfolioSlug("inverse-cramer")).toBe(false);
  });

  it("ante error de red o sin Supabase deja pasar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("red"); }));
    expect(await isUnknownPortfolioSlug("slug-inexistente")).toBe(false);
    __resetPortfolioSlugGate();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    expect(await isUnknownPortfolioSlug("slug-inexistente")).toBe(false);
  });
});
