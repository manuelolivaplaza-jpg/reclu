// Datos estaticos de la pagina de impuestos (F43). Fuera del modulo "use client"
// para que los Server Components reciban arreglos reales.

export const PLAZOS = [
  {
    etiqueta: "Declaración jurada 1929",
    plazo: "Antes del 30 de junio.",
    detalle:
      "Por las operaciones en el exterior del año anterior. Quien empezó a invertir en 2026 la presenta en 2027.",
  },
  {
    etiqueta: "Formulario 22",
    plazo: "En abril.",
    detalle:
      "Con rentas del exterior positivas: fila 12, código 1104. Las filas 14 (748) y 49 (746) van iguales y no superan la fila 12.",
  },
] as const;

export const GUIAS_OFICIALES = [
  {
    titulo: "SII — instrucciones DJ 1929 (PDF)",
    url: "https://www.sii.cl/declaraciones_juradas/suplemento/2025/instruccionesDJ1929.pdf",
  },
  {
    titulo: "SII — HOMER, declaraciones juradas y F22",
    url: "https://homer.sii.cl/",
  },
  {
    titulo: "Fintual — guía para completar la declaración 1929",
    url: "https://ayuda.fintual.cl/es/articles/7010875-guia-paso-a-paso-para-completar-la-declaracion-1929",
  },
  {
    titulo: "Racional — DJ 1929 y Formulario 22",
    url: "https://ayuda.racional.cl/es/articles/6010953-paso-a-paso-para-declarar-mis-stocks-al-sii-dj-1929-y-formulario-22",
  },
] as const;

const ETIQUETA_CODIGO: Record<number, string> = {
  10: "10 · Dividendos",
  11: "11 · Intereses",
  13: "13 · Ganancias de capital",
  21: "21 · Otras rentas",
};

const TITULO_PASO: Record<Paso, string> = {
  subir: "Sube el CSV de operaciones",
  revisar: "Revisa las operaciones y el tipo de cambio",
  resumen: "Resumen para la DJ 1929",
};

/* ------------------------------------------------------------------ */
/* Componente                                                          */
/* ------------------------------------------------------------------ */
