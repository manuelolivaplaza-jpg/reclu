import { describe, expect, it } from "vitest";
import {
  PUBLISH_DISCLAIMER,
  composeFromAlert,
  type ComposePortfolio,
} from "@/lib/publish/compose";
import { X_MAX_LENGTH, weightedLength } from "@/lib/publish/x";
import type { Channel } from "@/lib/publish/types";
import type { Alert } from "@/lib/types";

const CHANNELS: readonly Channel[] = ["x", "telegram", "newsletter"] as const;

const portfolio: ComposePortfolio = {
  slug: "pelosi-tracker",
  name: "Pelosi Tracker",
  source: "house_ptr",
};

function alert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    portfolio_id: "22222222-2222-4222-8222-222222222222",
    type: "new_trade",
    severity: "high",
    title: "Nueva compra declarada en Pelosi Tracker",
    summary:
      "Se declaró una compra de NVIDIA en el informe periódico de la Cámara de Representantes.",
    payload: {
      tx_date: "2026-08-21",
      disclosed: "2026-10-08",
      symbol: "NVDA",
    },
    created_at: "2026-10-08T18:30:00.000Z",
    ...overrides,
  };
}

describe("composeFromAlert", () => {
  it("respeta los 280 caracteres ponderados de X", () => {
    const body = composeFromAlert(alert(), portfolio, "x");

    expect(weightedLength(body)).toBeLessThanOrEqual(X_MAX_LENGTH);
    expect(body).toContain("08-10-2026");
    expect(body).toContain("48 días después de la operación");
    expect(body).toContain(
      "https://reclu.cl/portfolio/pelosi-tracker?utm_source=reclu&utm_medium=x&utm_campaign=alertas",
    );
    expect(body).toContain(PUBLISH_DISCLAIMER);
  });

  it("recorta un resumen largo sin perder aviso ni enlace", () => {
    const body = composeFromAlert(
      alert({
        summary:
          "Un resumen deliberadamente largo que repite información pública " +
          "para forzar el recorte del cuerpo en X. ".repeat(8).trim(),
      }),
      portfolio,
      "x",
    );

    expect(weightedLength(body)).toBeLessThanOrEqual(X_MAX_LENGTH);
    expect(body).toContain(PUBLISH_DISCLAIMER);
    expect(body).toContain("utm_medium=x");
    expect(body).toContain("08-10-2026");
  });

  it("incluye el aviso legal y el enlace UTM en todos los canales", () => {
    for (const channel of CHANNELS) {
      const body = composeFromAlert(alert(), portfolio, channel);
      expect(body).toContain(PUBLISH_DISCLAIMER);
      expect(body).toContain("utm_source=reclu");
      expect(body).toContain(`utm_medium=${channel}`);
      expect(body).toContain("https://reclu.cl/portfolio/pelosi-tracker");
    }
  });

  it("mantiene el aviso legal aunque la alerta no traiga fechas", () => {
    const body = composeFromAlert(
      alert({ payload: {}, summary: null, title: "Cambio de peso" }),
      portfolio,
      "telegram",
    );

    expect(body).toContain(PUBLISH_DISCLAIMER);
    expect(body).toContain("Atraso de divulgación no informado");
    expect(body).toContain("08-10-2026");
  });

  it("no expone nombres de personas en una alerta de InfoProbidad", () => {
    const info: ComposePortfolio = {
      slug: "infoProbidad-cl",
      name: "Declaraciones InfoProbidad",
      source: "infoprobidad",
    };
    const privateName = "Juan Pérez Soto";
    const infoAlert = alert({
      type: "threshold",
      title: `${privateName} declara acciones en LATAM`,
      summary: `${privateName}, autoridad de la República, declaró acciones en LATAM.`,
      payload: {
        nombre: "LATAM",
        autoridades: 106,
        autoridades_antes: 98,
        ultima_declaracion: "2026-10-07",
      },
    });

    for (const channel of CHANNELS) {
      const body = composeFromAlert(infoAlert, info, channel);
      expect(body).not.toContain(privateName);
      expect(body).not.toContain("Juan");
      expect(body).not.toContain("Pérez");
      expect(body).toContain("LATAM");
      expect(body).toContain("106 autoridades");
      expect(body).toContain("sin nombres");
      expect(body).toContain(PUBLISH_DISCLAIMER);
    }
  });

  it("es pura: dos llamadas con el mismo input dan el mismo texto", () => {
    const first = composeFromAlert(alert(), portfolio, "newsletter");
    const second = composeFromAlert(alert(), portfolio, "newsletter");
    expect(first).toBe(second);
  });
});
