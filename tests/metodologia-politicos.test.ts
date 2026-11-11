import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const page = readFileSync(
  join(process.cwd(), "src/app/metodologia/page.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("Metodología: posiciones de políticos", () => {
  it("dice que las posiciones reconstruidas son para suscriptores", () => {
    expect(page).toMatch(/posiciones reconstruidas[\s\S]{0,200}suscriptores/i);
    expect(page).toContain("5 U.S.C. § 13107");
    expect(page).not.toContain("nunca se recortan ni se cobran");
    expect(page).not.toContain("Datos públicos de funcionarios, fuera del muro");
    expect(page).not.toMatch(
      /esas series se entregan completas,\s*gratis y sin muro/i,
    );
  });
});
