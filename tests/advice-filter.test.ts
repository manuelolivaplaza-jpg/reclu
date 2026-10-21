import { describe, expect, it } from "vitest";

import {
  adviceRule,
  AI_DISCLAIMER,
  containsAdvice,
  NEUTRAL_ADVICE_REPLACEMENT,
  sanitizeAdvice,
} from "@/lib/advice-filter";

/**
 * F69: filtro de "no recomendación". Incluye falsos positivos para verificar
 * que los límites de palabra no marquen sustantivos como "compraventa".
 */
describe("containsAdvice: detecta recomendaciones", () => {
  const positivos = [
    "Compra NVDA ahora.",
    "CÓMPRALO ya, antes del cierre.",
    "Vende tu posición en Tesla.",
    "vende ahora mismo",
    "Mantén la posición al menos un trimestre.",
    "Deberías comprar más acciones.",
    "Te recomiendo vender antes de la junta.",
    "No compres ese ETF.",
    "Es momento de comprar.",
    "Buy NVDA before earnings.",
    "SELL your shares now.",
    "Hold your position.",
    "You should buy this dip.",
    "We recommend selling the fund.",
    "I suggest buying more.",
    "recomendamos comprar",
    "mantener",
    "El analista dijo: deberías considerar vender.",
  ];

  it.each(positivos)("detecta: %s", (texto) => {
    expect(containsAdvice(texto)).toBe(true);
  });
});

describe("containsAdvice: no marca falsos positivos", () => {
  const negativos = [
    "La compraventa de acciones aumentó en el trimestre.",
    "El comprador institucional apareció en la declaración.",
    "Los compradores minoristas redujeron su exposición.",
    "El holding mantiene su participación histórica.",
    "La mantención del dividendo fue aprobada por la junta.",
    "La compañía anunció la venta de una filial.",
    "El fondo mantendrá su política de inversión.",
    "El seller y el buyer negociaron fuera de rueda.",
    "La mantenibilidad del sistema es alta.",
    "",
  ];

  it.each(negativos)("no marca: %s", (texto) => {
    expect(containsAdvice(texto)).toBe(false);
  });
});

describe("sanitizeAdvice", () => {
  it("deja intacto el texto informativo", () => {
    const texto = "Pelosi declaró un cambio de ponderación en NVDA.";
    expect(sanitizeAdvice(texto)).toBe(texto);
  });

  it("reemplaza una recomendación por el texto neutro y el descargo", () => {
    const resultado = sanitizeAdvice("Compra NVDA ahora: va a subir.");

    expect(resultado).toContain(NEUTRAL_ADVICE_REPLACEMENT);
    expect(resultado).toContain(AI_DISCLAIMER);
    expect(resultado).not.toContain("va a subir");
    expect(resultado.trim()).toBe(resultado);
  });

  it("es idempotente: un texto ya saneado no se vuelve a reemplazar", () => {
    const unaVez = sanitizeAdvice("Vende todo.");
    expect(sanitizeAdvice(unaVez)).toBe(unaVez);
  });

  it("mantiene vacío lo vacío", () => {
    expect(sanitizeAdvice("")).toBe("");
    expect(sanitizeAdvice("   ")).toBe("");
  });

  it("usa el descargo §2.2 del informe legal", () => {
    expect(AI_DISCLAIMER).toContain("Respuesta generada automáticamente por inteligencia artificial");
    expect(AI_DISCLAIMER).toContain("No es una recomendación de compra, venta ni mantención");
    expect(AI_DISCLAIMER).toContain("asesoría personalizada");
    expect(AI_DISCLAIMER).toContain("revisa siempre la fuente citada");
    expect(AI_DISCLAIMER).toContain("Las decisiones de inversión son solo tuyas");
  });
});

describe("adviceRule", () => {
  it("identifica la frase que saltó sin exponer el texto", () => {
    expect(adviceRule("Te recomiendo vender ahora.")).toBe("imperative");
    expect(adviceRule("Compra NVDA mañana.")).toBe("token:compra");
  });

  it("devuelve null cuando el texto es informativo", () => {
    expect(adviceRule("La compraventa de acciones aumentó en el trimestre.")).toBeNull();
    expect(adviceRule("")).toBeNull();
  });

  it("no incluye el texto analizado en la regla", () => {
    const regla = adviceRule("Te recomiendo comprar NVDA por el momentum.");
    expect(regla).not.toBeNull();
    expect(regla).not.toContain("NVDA");
  });
});
