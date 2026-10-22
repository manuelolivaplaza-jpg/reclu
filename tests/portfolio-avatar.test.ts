import { describe, expect, it } from "vitest";
import {
  avatarGradient,
  avatarInitials,
  avatarSource,
  categoryIcon,
} from "@/lib/portfolio-avatar";

/**
 * D4 — lógica pura del avatar de portafolios.
 *
 *  - `avatarInitials`: 2 letras, sin "Tracker"/"13F".
 *  - `avatarGradient`: hash determinista del slug -> 6 degradados.
 *  - `categoryIcon`: nombre del ícono lucide por categoría.
 *  - `avatarSource`: retrato > cover > iniciales, tolerante a la 055
 *    sin aplicar (campos undefined).
 */

describe("avatarInitials", () => {
  it("toma las iniciales de las dos primeras palabras", () => {
    expect(avatarInitials("Nancy Pelosi")).toBe("NP");
    expect(avatarInitials("Trump Dice")).toBe("TD");
  });

  it("ignora Tracker y 13F", () => {
    expect(avatarInitials("Pelosi Tracker")).toBe("PE");
    expect(avatarInitials("Nancy Pelosi Tracker")).toBe("NP");
    expect(avatarInitials("Warren Buffett 13F")).toBe("WB");
    expect(avatarInitials("Scion 13F Tracker")).toBe("SC");
  });

  it("con una sola palabra toma sus dos primeras letras", () => {
    expect(avatarInitials("Pelosi")).toBe("PE");
    expect(avatarInitials("Renta")).toBe("RE");
  });

  it("mantiene números (R4) y elimina puntuación", () => {
    expect(avatarInitials("Renta 4")).toBe("R4");
    expect(avatarInitials("AI World War III")).toBe("AW");
  });

  it("devuelve vacío sin nada usable", () => {
    expect(avatarInitials("")).toBe("");
    expect(avatarInitials(null)).toBe("");
    expect(avatarInitials(undefined)).toBe("");
    expect(avatarInitials("!!!")).toBe("");
    expect(avatarInitials("Tracker 13F")).toBe("");
  });
});

describe("avatarGradient", () => {
  const GRADIENTS = new Set([
    "from-neutral-700 to-neutral-900",
    "from-neutral-500 to-neutral-800",
    "from-neutral-600 to-neutral-950",
    "from-neutral-800 to-neutral-500",
    "from-neutral-900 to-neutral-700",
    "from-neutral-500 to-neutral-950",
  ]);

  it("devuelve uno de los 6 degradados de la paleta", () => {
    for (let i = 0; i < 200; i++) {
      const gradient = avatarGradient(`slug-${i}`);
      expect(GRADIENTS.has(gradient)).toBe(true);
    }
  });

  it("es determinista: mismo slug, mismo degradado", () => {
    expect(avatarGradient("pelosi-tracker")).toBe(avatarGradient("pelosi-tracker"));
    expect(avatarGradient("a")).toBe(avatarGradient("a"));
    expect(avatarGradient("a")).not.toBe(avatarGradient("b"));
  });

  it("cubre varios degradados con slugs distintos", () => {
    const seen = new Set(
      Array.from({ length: 60 }, (_, i) => avatarGradient(`slug-${i}`)),
    );
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it("cae a un degradado válido sin slug", () => {
    expect(GRADIENTS.has(avatarGradient(null))).toBe(true);
    expect(GRADIENTS.has(avatarGradient(undefined))).toBe(true);
    expect(GRADIENTS.has(avatarGradient(""))).toBe(true);
  });
});

describe("categoryIcon", () => {
  it("mapea cada categoría a su ícono lucide", () => {
    expect(categoryIcon("political_us")).toBe("Landmark");
    expect(categoryIcon("hedge_fund")).toBe("Briefcase");
    expect(categoryIcon("broker_cl")).toBe("Building2");
    expect(categoryIcon("public_disclosure")).toBe("FileText");
    expect(categoryIcon("model")).toBe("Cpu");
    expect(categoryIcon("thematic")).toBe("Sparkles");
  });
});

describe("avatarSource", () => {
  it("prefiere el retrato cuando existe", () => {
    expect(
      avatarSource({
        slug: "pelosi-tracker",
        portrait_image: "pelosi-tracker.webp",
        cover_image: "01-capitolio.png",
      }),
    ).toEqual({ kind: "portrait", src: "/portraits/pelosi-tracker.webp" });
  });

  it("usa el cover si no hay retrato", () => {
    expect(
      avatarSource({
        slug: "renta4-moderada",
        portrait_image: null,
        cover_image: "11-banca.png",
      }),
    ).toEqual({ kind: "cover", src: "/covers/11-banca.png" });
  });

  it("cae a iniciales sin retrato ni cover", () => {
    expect(
      avatarSource({ slug: "x", portrait_image: null, cover_image: null }),
    ).toEqual({ kind: "initials" });
  });

  it("tolera la migración 055 sin aplicar (campos undefined)", () => {
    expect(avatarSource({ slug: "x", cover_image: "02-toro.png" })).toEqual({
      kind: "cover",
      src: "/covers/02-toro.png",
    });
    expect(avatarSource({ slug: "x" })).toEqual({ kind: "initials" });
    expect(avatarSource({})).toEqual({ kind: "initials" });
  });

  it("ignora strings vacíos", () => {
    expect(
      avatarSource({ slug: "x", portrait_image: "", cover_image: "" }),
    ).toEqual({ kind: "initials" });
  });
});
