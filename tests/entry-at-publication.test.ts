import { describe, expect, it } from "vitest";
import { formatLagBadge, lagDays } from "@/lib/disclosure-lag";
import { returnSincePublication } from "@/lib/entry-at-publication";
import type { SeriesPoint } from "@/lib/performance";

const series: SeriesPoint[] = [
  { date: "2026-10-01", value: 100 },
  { date: "2026-10-08", value: 110 },
  { date: "2026-10-09", value: 100 },
  { date: "2026-10-12", value: 115 },
  { date: "2026-10-16", value: 121 },
];

describe("returnSincePublication", () => {
  it("mide el nivel desde el día de publicación hasta el último punto", () => {
    expect(returnSincePublication(series, "2026-10-08")).toBe(10);
  });

  it("usa el día de Chile cuando la publicación trae hora", () => {
    // 08-10-2026 02:30 UTC = 07-10-2026 23:30 hora de Chile (UTC−3).
    // La primera sesión en o después del 07-10 es el 08-10.
    expect(returnSincePublication(series, "2026-10-08T02:30:00Z")).toBe(10);
    // 15:00 UTC = 12:00 hora de Chile, mismo día 08-10.
    expect(returnSincePublication(series, "2026-10-08T15:00:00Z")).toBe(10);
  });

  it("usa la sesión siguiente si ese día no está en la serie", () => {
    // 115 → 121 = 5,2174%
    expect(returnSincePublication(series, "2026-10-10")).toBe(5.2174);
  });

  it("devuelve 0 si la publicación es el último punto", () => {
    expect(returnSincePublication(series, "2026-10-16")).toBe(0);
  });

  it("devuelve null si no hay precio a 10 días, la fecha es posterior o no parsea", () => {
    expect(returnSincePublication(series, "2026-01-01")).toBeNull();
    expect(returnSincePublication(series, "2026-10-20")).toBeNull();
    expect(returnSincePublication(series, "ayer")).toBeNull();
    expect(returnSincePublication(series, null)).toBeNull();
    expect(returnSincePublication([], "2026-10-08")).toBeNull();
  });
});

describe("lagDays y el texto del badge", () => {
  it("cuenta 48 días de trans_date a report_published (F13)", () => {
    const payload = { trans_date: "2026-08-21", report_published: "2026-10-08" };
    expect(lagDays(payload)).toBe(48);
    expect(formatLagBadge({ publishedAt: "2026-10-08", lagDays: lagDays(payload) })).toBe(
      "Publicado 08-10-2026 · 48 días después de la operación",
    );
  });

  it("reconoce filed_at y etiqueta la hora de Chile", () => {
    expect(lagDays({ tx_date: "2024-01-01", filed_at: "2024-01-03" })).toBe(2);
    expect(
      formatLagBadge({
        publishedAt: "2026-10-08T15:00:00Z",
        lagDays: 48,
      }),
    ).toBe("Publicado 08-10-2026 12:00 hora de Chile · 48 días después de la operación");
  });

  it("muestra la hora de registro si la publicación oficial no trae reloj", () => {
    expect(
      formatLagBadge({
        publishedAt: "2026-10-08",
        recordedAt: "2026-10-08T15:00:00Z",
        lagDays: 48,
      }),
    ).toBe("Publicado 08-10-2026 12:00 hora de Chile · 48 días después de la operación");

    expect(
      formatLagBadge({
        publishedAt: "2026-10-08",
        recordedAt: "2026-10-09T15:00:00Z",
        lagDays: 48,
      }),
    ).toBe(
      "Publicado 08-10-2026 · 48 días después de la operación · registrada 09-10-2026 12:00 hora de Chile",
    );
  });
});
