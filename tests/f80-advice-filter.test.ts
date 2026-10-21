import { describe, expect, it } from "vitest";

import { containsAdvice } from "@/lib/advice-filter";

/**
 * F80 - punto 6: el filtro de recomendaciones reconoce mas formas de
 * recomendar en espanol. Antes se escapaban "te sugiero", "conviene",
 * "recomendar", "apuesta por", "podrias considerar" y "es buena idea".
 */
describe("F80: nuevas formas de recomendar bloqueadas", () => {
  const bloqueadas = [
    // sugerir / sugiero / sugerimos
    "Te sugiero vender antes de la junta.",
    "Sugiero reducir la posicion en NVDA.",
    "Sugerimos aumentar la exposicion al sector.",
    "Sugerir un promedio de compra bajo es una estrategia.",
    "te sugiero",
    "les sugiero",
    // conviene
    "Conviene vender antes del dividendo.",
    "No conviene mantener esa posicion.",
    // recomendar / recomendacion
    "Recomendar comprar despues del dividendo.",
    "La recomendacion del analista es comprar.",
    // apuesta por
    "Apuesta por el sector de semiconductores.",
    // podrias considerar
    "Podrias considerar vender la posicion.",
    // es buena idea
    "Es buena idea comprar mas.",
    "Son buena idea las acciones del sector.",
  ];

  it.each(bloqueadas)("detecta: %s", (texto) => {
    expect(containsAdvice(texto)).toBe(true);
  });
});

describe("F80: frases neutras que NO deben bloquearse", () => {
  const neutras = [
    "La bolsa cerro la jornada con una variacion del 1,2%.",
    "El informe trimestral muestra ingresos por 4.500 millones de dolares.",
    "La empresa anuncio un nuevo consejo directivo.",
  ];

  it.each(neutras)("no marca: %s", (texto) => {
    expect(containsAdvice(texto)).toBe(false);
  });
});
