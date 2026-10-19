/**
 * Agregado público de InfoProbidad: empresas, no personas.
 * Sin dirección, estado civil, régimen patrimonial, bienes ni pasivos.
 * Con menos de MIN_AUTORIDADES no se muestran valor ni fecha.
 */

import { createClient } from "@/lib/supabase/server";

export const INFOPROBIDAD_SLUG = "infoProbidad-cl";
export const INFOPROBIDAD_FUENTE =
  "Fuente: InfoProbidad, Consejo para la Transparencia (CC BY 4.0)";
export const INFOPROBIDAD_URL = "https://www.infoprobidad.cl/";
export const INFOPROBIDAD_LICENCIA_URL =
  "https://creativecommons.org/licenses/by/4.0/deed.es";
export const AVISO_FINALIDAD =
  "Transparencia sobre posibles conflictos de interés. No es una recomendación de inversión.";
export const AVISO_SIMULACION =
  "Simulación histórica con fines informativos. No es recomendación de inversión.";

/** Mismo piso que scrapers/infoprobidad.py. 1 o 2 declarantes reidentifican. */
export const MIN_AUTORIDADES = 3;

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export interface EmpresaPublica {
  rut: string;
  nombre: string;
  symbol: string | null;
  autoridades: number;
  valorDeclaradoClp: number | null;
  ultimaDeclaracion: string | null;
}

export interface EmpresasAgregado {
  rows: EmpresaPublica[];
  isDemo: boolean;
}

/** Conteos ilustrativos del ejemplo verificado (2026-10-19). No son personas. */
const DEMO_EMPRESAS: EmpresaPublica[] = [
  { rut: "82878900", nombre: "Cooperativa del Personal de la U. de Chile", symbol: null, autoridades: 122, valorDeclaradoClp: null, ultimaDeclaracion: "2026-10-08" },
  { rut: "89862200", nombre: "LATAM", symbol: "LTM", autoridades: 106, valorDeclaradoClp: null, ultimaDeclaracion: "2026-10-07" },
  { rut: "97004000", nombre: "Banco de Chile", symbol: "CHILE", autoridades: 70, valorDeclaradoClp: null, ultimaDeclaracion: "2026-10-07" },
  { rut: "90160000", nombre: "CSAV", symbol: "VAPORES", autoridades: 54, valorDeclaradoClp: null, ultimaDeclaracion: "2026-10-07" },
  { rut: "91081000", nombre: "Enel Generación Chile", symbol: "ENELGXCH", autoridades: 52, valorDeclaradoClp: null, ultimaDeclaracion: "2026-10-07" },
  { rut: "94271000", nombre: "Enel Américas", symbol: "ENELAM", autoridades: 48, valorDeclaradoClp: null, ultimaDeclaracion: "2026-09-28" },
  { rut: "97036000", nombre: "Banco Santander", symbol: "BSANTANDER", autoridades: 42, valorDeclaradoClp: null, ultimaDeclaracion: "2026-10-09" },
  { rut: "90222000", nombre: "CMPC", symbol: "CMPC", autoridades: 39, valorDeclaradoClp: null, ultimaDeclaracion: "2026-10-07" },
  { rut: "93007000", nombre: "SQM-B", symbol: "SQM-B", autoridades: 32, valorDeclaradoClp: null, ultimaDeclaracion: "2026-10-09" },
  { rut: "93834000", nombre: "Cencosud", symbol: "CENCOSUD", autoridades: 30, valorDeclaradoClp: null, ultimaDeclaracion: "2026-10-07" },
];

function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

export function formatValorClp(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return "—";
  const body = Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$${body}`;
}

export function formatFechaDeclaracion(iso: string | null): string {
  if (!iso) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return "—";
  const month = MESES[Number(match[2]) - 1];
  if (!month) return "—";
  return `${Number(match[3])} ${month} ${match[1]}`;
}

export function formatAutoridades(value: number): string {
  if (!Number.isFinite(value) || value < MIN_AUTORIDADES) return "menos de 3";
  return String(Math.round(value));
}

export function toEmpresaPublica(row: Record<string, unknown>): EmpresaPublica | null {
  const rawRut = String(row.rut ?? "").trim().replace(/\./g, "");
  const cuerpo = rawRut.includes("-") ? (rawRut.split("-")[0] ?? "") : rawRut;
  const rut = cuerpo.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const nombre = String(row.nombre ?? "").trim();
  if (!rut || rut === "0" || !nombre) return null;
  const autoridades = Number(row.autoridades);
  if (!Number.isFinite(autoridades) || autoridades < 0) return null;
  const symbolRaw = row.symbol;
  const symbol = typeof symbolRaw === "string" && symbolRaw.trim() ? symbolRaw.trim() : null;
  const autoridadesRedondeadas = Math.round(autoridades);
  const visible = autoridadesRedondeadas >= MIN_AUTORIDADES;
  const valorRaw = row.valor_declarado_clp;
  const valorNum = valorRaw === null || valorRaw === undefined || valorRaw === "" ? null : Number(valorRaw);
  const fechaRaw = row.ultima_declaracion;
  const fecha = typeof fechaRaw === "string" && fechaRaw ? fechaRaw.slice(0, 10) : null;
  return {
    rut,
    nombre,
    symbol,
    autoridades: autoridadesRedondeadas,
    valorDeclaradoClp:
      visible && valorNum !== null && Number.isFinite(valorNum) && valorNum > 0 ? valorNum : null,
    ultimaDeclaracion: visible ? fecha : null,
  };
}

export async function getInfoprobidadEmpresas(): Promise<EmpresasAgregado> {
  if (!isSupabaseLive()) return { rows: DEMO_EMPRESAS, isDemo: true };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("infoprobidad_empresas")
      .select("rut, nombre, symbol, autoridades, valor_declarado_clp, ultima_declaracion")
      .order("autoridades", { ascending: false })
      .limit(50);
    if (error || !Array.isArray(data)) {
      if (error) console.warn("[reclu] infoprobidad_empresas:", error.message);
      return { rows: [], isDemo: false };
    }
    const rows = data
      .map((row) => toEmpresaPublica(row as Record<string, unknown>))
      .filter((row): row is EmpresaPublica => row !== null);
    return { rows, isDemo: false };
  } catch (err) {
    console.warn("[reclu] infoprobidad_empresas:", err instanceof Error ? err.message : err);
    return { rows: [], isDemo: false };
  }
}
