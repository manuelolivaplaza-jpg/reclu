import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sql = readFileSync(join(root, "supabase/migrations/068_logos_oficiales.sql"), "utf8");
const attributions = readFileSync(join(root, "public/portraits/ATRIBUCIONES-LOGOS.md"), "utf8");
const files = [...sql.matchAll(/portrait_image = '([^']+)'/g)].map((m) => m[1]);

describe("D41 logos oficiales", () => {
  it("cada logo de la migración existe, pesa poco y tiene atribución", () => {
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) {
      const path = join(root, "public/portraits", f);
      expect(existsSync(path), f).toBe(true);
      expect(readFileSync(path).length).toBeLessThan(20_000);
      expect(attributions).toContain(f);
    }
  });
  it("cada update trae fuente y licencia", () => {
    const blocks = sql.split("update public.portfolios").slice(1);
    for (const b of blocks) {
      expect(b).toMatch(/portrait_source = 'https:\/\//);
      expect(b).toMatch(/portrait_license = '[^']+'/);
    }
  });
});
