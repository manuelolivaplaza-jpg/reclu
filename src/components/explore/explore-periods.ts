/** d68: períodos del carrusel de Explorar (seguro para componentes cliente). */
export type HeroPeriod = "d1" | "w1" | "m1" | "m3" | "y1" | "max";

export const HERO_PERIODS: { key: HeroPeriod; label: string; long: string }[] = [
  { key: "d1", label: "1D", long: "en 1 día" },
  { key: "w1", label: "1S", long: "en 1 semana" },
  { key: "m1", label: "1M", long: "en 1 mes" },
  { key: "m3", label: "3M", long: "en 3 meses" },
  { key: "y1", label: "1A", long: "en 1 año" },
  { key: "max", label: "Máx", long: "desde el inicio" },
];

