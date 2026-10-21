import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * F72: helper aislado del panel "Pregunta a la IA".
 *
 * `fetch` está mockeado: se verifica que el endpoint ausente (F71) degrade a
 * "unavailable" y que las respuestas válidas se validen sin arrastrar Zod al
 * cliente.
 */

import {
  IMPACT_EMPTY_ANALYSIS_MESSAGE,
  IMPACT_QUOTA_MESSAGE,
  IMPACT_UNAVAILABLE_MESSAGE,
  isImpactAnalysis,
  requestImpact,
} from "@/lib/impact-client";
import { AI_DISCLAIMER } from "@/lib/ai-disclaimer";

const ANALYSIS = {
  resumen: "La empresa informó resultados trimestrales.",
  canal_de_impacto: "Resultados y márgenes del negocio.",
  direccion_posible: "incierta",
  horizonte: "corto",
  incertidumbre: "media",
  que_mirar: "El detalle de márgenes y la guía de la compañía.",
};

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(response: Response | Error) {
  fetchMock.mockImplementation(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
}

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("requestImpact", () => {
  it("envía solo news_id, symbol y la pregunta recortada", async () => {
    stubFetch(jsonResponse(200, { analysis: ANALYSIS, cached: true }));

    const result = await requestImpact({
      newsId: "news-1",
      symbol: "AAPL",
      question: "  ¿qué reviso?  ",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/impact");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      news_id: "news-1",
      symbol: "AAPL",
      question: "¿qué reviso?",
    });
    expect(result).toEqual({
      status: "ok",
      analysis: ANALYSIS,
      cached: true,
      disclaimer: AI_DISCLAIMER,
    });
  });

  it("no manda question si viene vacía", async () => {
    stubFetch(jsonResponse(200, { analysis: ANALYSIS }));

    await requestImpact({ newsId: "news-1", symbol: "AAPL", question: "   " });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      news_id: "news-1",
      symbol: "AAPL",
    });
  });

  it("F71 ausente (404) degrada a unavailable sin romper el feed", async () => {
    stubFetch(jsonResponse(404, { error: "not found" }));

    await expect(
      requestImpact({ newsId: "news-1", symbol: "AAPL" }),
    ).resolves.toEqual({
      status: "unavailable",
      message: IMPACT_UNAVAILABLE_MESSAGE,
    });
  });

  it("cupo agotado devuelve un mensaje claro", async () => {
    stubFetch(jsonResponse(429, { error: "quota" }));

    await expect(
      requestImpact({ newsId: "news-1", symbol: "AAPL" }),
    ).resolves.toEqual({ status: "error", message: IMPACT_QUOTA_MESSAGE });
  });

  it("un análisis con formato inválido no se muestra", async () => {
    stubFetch(jsonResponse(200, { analysis: { resumen: "falta todo" } }));

    await expect(
      requestImpact({ newsId: "news-1", symbol: "AAPL" }),
    ).resolves.toEqual({
      status: "error",
      message: IMPACT_EMPTY_ANALYSIS_MESSAGE,
    });
  });

  it("un fallo de red no lanza", async () => {
    stubFetch(new Error("offline"));

    const result = await requestImpact({ newsId: "news-1", symbol: "AAPL" });
    expect(result.status).toBe("error");
  });
});

describe("isImpactAnalysis", () => {
  it("acepta el esquema de F70 y rechaza direcciones desconocidas", () => {
    expect(isImpactAnalysis(ANALYSIS)).toBe(true);
    expect(isImpactAnalysis({ ...ANALYSIS, direccion_posible: "comprar" })).toBe(
      false,
    );
    expect(isImpactAnalysis(null)).toBe(false);
  });
});
