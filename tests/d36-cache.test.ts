import { describe, expect, it, vi, beforeEach } from "vitest";

const SECRET = "s".repeat(32);

describe("isRevalidateAuthorized", async () => {
  const { isRevalidateAuthorized } = await import("@/lib/revalidate-auth");
  it("acepta el bearer correcto", () => {
    expect(isRevalidateAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });
  it("rechaza secreto distinto, vacío, corto o sin header", () => {
    expect(isRevalidateAuthorized(`Bearer ${"x".repeat(32)}`, SECRET)).toBe(false);
    expect(isRevalidateAuthorized(`Bearer ${SECRET}`, "")).toBe(false);
    expect(isRevalidateAuthorized(`Bearer short`, "short")).toBe(false);
    expect(isRevalidateAuthorized(null, SECRET)).toBe(false);
    expect(isRevalidateAuthorized(SECRET, SECRET)).toBe(false);
  });
});

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  cacheLife: () => {},
  cacheTag: () => {},
}));

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    revalidateTag.mockReset();
    vi.unstubAllEnvs();
  });
  it("503 sin REVALIDATE_SECRET", async () => {
    vi.stubEnv("REVALIDATE_SECRET", "");
    const { POST } = await import("@/app/api/revalidate/route");
    const res = await POST(new Request("http://x/api/revalidate", { method: "POST" }));
    expect(res.status).toBe(503);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
  it("401 con secreto incorrecto", async () => {
    vi.stubEnv("REVALIDATE_SECRET", SECRET);
    const { POST } = await import("@/app/api/revalidate/route");
    const res = await POST(new Request("http://x", { method: "POST", headers: { authorization: "Bearer nope" } }));
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).not.toContain(SECRET);
  });
  it("200 invalida los tags públicos", async () => {
    vi.stubEnv("REVALIDATE_SECRET", SECRET);
    const { POST } = await import("@/app/api/revalidate/route");
    const res = await POST(new Request("http://x", { method: "POST", headers: { authorization: `Bearer ${SECRET}` } }));
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("public-data", "max");
  });
});

describe("groupPerformanceRows", async () => {
  const { groupPerformanceRows } = await import("@/lib/queries");
  it("agrupa por portafolio, ordena por fecha y descarta filas inválidas", () => {
    const out = groupPerformanceRows(
      [
        { portfolio_id: "b", date: "2026-01-02", value_pct: 2, is_estimated: false },
        { portfolio_id: "a", date: "2026-01-03", value_pct: "1.5", is_estimated: true },
        { portfolio_id: "a", date: "2026-01-01", value_pct: 0, is_estimated: false },
        { portfolio_id: "z", date: "2026-01-01", value_pct: 1 },
        { portfolio_id: "a", date: null, value_pct: 1 },
      ],
      ["a", "b", "c"],
    );
    expect(out.a.map((p) => p.date)).toEqual(["2026-01-01", "2026-01-03"]);
    expect(out.a[1]).toEqual({ date: "2026-01-03", value: 1.5, estimated: true });
    expect(out.b).toHaveLength(1);
    expect(out.c).toEqual([]);
    expect("z" in out).toBe(false);
  });
});
