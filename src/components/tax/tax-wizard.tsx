"use client";

/**
 * Asistente paso a paso de la DJ 1929 (F43).
 *
 * Todo corre en el navegador: el CSV se lee con `File.text()` y no se envía
 * a ningún servidor. Este archivo **no** usa `fetch` ni ningún otro envío.
 * Solo ordena los montos que la DJ 1929 pide en la sección B. No calcula el
 * impuesto a pagar ni reemplaza la declaración en el SII.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DJ1929_NO_CALCULA_IMPUESTO,
  PARTICIPACION_POR_DEFECTO,
  RELACION_SIN_RELACION,
  resumirInstrumentos,
  type Operacion,
  type ResumenDJ1929,
  type ResumenInstrumento,
} from "@/lib/tax/dj1929";
import { FORMATO_CSV_GENERICO, interpretarMonto, parseGenericCsv } from "@/lib/tax/import";

/* ------------------------------------------------------------------ */
/* Lógica de pasos (pura, sin DOM)                                     */
/* ------------------------------------------------------------------ */

export const PASOS = ["subir", "revisar", "resumen"] as const;
export type Paso = (typeof PASOS)[number];

/** Año de las operaciones. La DJ 1929 se presenta el año siguiente. */
export const ANIO_DEFECTO = 2025;

export type EstadoWizard = {
  paso: Paso;
  operaciones: Operacion[];
  erroresCsv: string[];
  /** Texto tal cual lo escribió la persona. Se valida antes de usarlo. */
  tipoCambio: string;
  anio: number;
};

export function estadoInicial(anio: number = ANIO_DEFECTO): EstadoWizard {
  return { paso: "subir", operaciones: [], erroresCsv: [], tipoCambio: "", anio };
}

export function indicePaso(paso: Paso): number {
  return PASOS.indexOf(paso);
}

export function pasoSiguiente(paso: Paso): Paso | null {
  return PASOS[indicePaso(paso) + 1] ?? null;
}

export function pasoAnterior(paso: Paso): Paso | null {
  const indice = indicePaso(paso);
  return indice > 0 ? PASOS[indice - 1] : null;
}

/** Pesos por dólar. Acepta punto decimal o coma decimal. Cero y negativos no sirven. */
export function parsearTipoCambio(raw: string): number | null {
  const valor = interpretarMonto(raw);
  if (valor === null || valor <= 0) return null;
  return valor;
}

/**
 * Motivo por el que no se puede avanzar desde el paso actual.
 * `null` significa que se puede.
 */
export function motivoBloqueo(estado: EstadoWizard): string | null {
  if (estado.paso === "subir") {
    if (estado.operaciones.length === 0) {
      return "Sube un CSV con al menos una operación para continuar.";
    }
    return null;
  }
  if (estado.paso === "revisar") {
    if (parsearTipoCambio(estado.tipoCambio) === null) {
      return "Ingresa el tipo de cambio en pesos por dólar, mayor que cero.";
    }
    return null;
  }
  return null;
}

export function puedeAvanzar(estado: EstadoWizard): boolean {
  return motivoBloqueo(estado) === null;
}

/** Resumen de la sección B. `null` si todavía falta el tipo de cambio. */
export function resumir(estado: EstadoWizard): ResumenDJ1929 | null {
  const clpPorUsd = parsearTipoCambio(estado.tipoCambio);
  if (clpPorUsd === null) return null;
  try {
    return resumirInstrumentos(estado.operaciones, clpPorUsd, { anio: estado.anio });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Formato (manual, para no depender del locale del navegador)         */
/* ------------------------------------------------------------------ */

export function formatoClp(valor: number): string {
  const entero = Math.round(valor);
  const signo = entero < 0 ? "-" : "";
  return signo + Math.abs(entero).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function formatoUsd(valor: number): string {
  const [entero, decimal] = Math.abs(valor).toFixed(2).split(".");
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${valor < 0 ? "-" : ""}${conMiles},${decimal}`;
}

/* ------------------------------------------------------------------ */
/* CSV de salida (resumen propio, no el archivo oficial del SII)       */
/* ------------------------------------------------------------------ */

export const CSV_RESUMEN_ENCABEZADO = [
  "operacion",
  "nombre",
  "pais",
  "tax_id",
  "monto_31_12_usd",
  "monto_31_12_clp",
  "rentas_usd",
  "rentas_clp",
  "perdidas_usd",
  "perdidas_clp",
  "impuesto_retenido_usd",
  "impuesto_retenido_clp",
  "domicilio",
  "ciudad",
].join(",");

function csvCampo(valor: string | number | undefined): string {
  if (valor === undefined) return "";
  const texto = String(valor);
  return /[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Resumen en CSV con encabezados. **No** es el archivo que sube el SII:
 * ese lo entrega la corredora. Sirve para revisar y guardar los montos.
 */
export function armarCsvResumen(filas: readonly ResumenInstrumento[]): string {
  const lineas = filas.map((fila) =>
    [
      fila.codigo,
      fila.nombre,
      fila.pais,
      fila.taxId,
      fila.monto31DicUsd,
      fila.monto31DicClp,
      fila.rentasUsd,
      fila.rentasClp,
      fila.perdidasUsd,
      fila.perdidasClp,
      fila.impuestoRetenidoUsd,
      fila.impuestoRetenidoClp,
      fila.domicilio,
      fila.ciudad,
    ]
      .map(csvCampo)
      .join(","),
  );
  return [CSV_RESUMEN_ENCABEZADO, ...lineas].join("\n") + "\n";
}

export function nombreArchivoCsv(anio: number): string {
  return `resumen-dj1929-fraccion-${anio}.csv`;
}

export function nombreArchivoImportado(): string {
  return "operaciones-dj1929-fraccion.csv";
}

/* ------------------------------------------------------------------ */
/* Datos de referencia                                                 */
/* ------------------------------------------------------------------ */

export { PLAZOS, GUIAS_OFICIALES } from "@/lib/tax/plazos";

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

const TITULO_CORTO: Record<Paso, string> = {
  subir: "Subir el CSV",
  revisar: "Revisar",
  resumen: "Resumen",
};

/** Tope de cordura: un valor mayor es un error de tipeo, no un tipo de cambio. */
const TIPO_CAMBIO_MAXIMO = 1_000_000;

const ANIO_MINIMO = 1990;
const ANIO_MAXIMO = 2100;

type OrigenCarga = "archivo" | "muestra" | null;

/* ------------------------------------------------------------------ */
/* Validación de presentación (no cambia los cálculos)                 */
/* ------------------------------------------------------------------ */

function anioEsValido(anio: number): boolean {
  return Number.isInteger(anio) && anio >= ANIO_MINIMO && anio <= ANIO_MAXIMO;
}

function errorAnio(anio: number): string | null {
  return anioEsValido(anio)
    ? null
    : `El año tiene que ser un número entero entre ${ANIO_MINIMO} y ${ANIO_MAXIMO}.`;
}

function errorTipoCambio(raw: string): string | null {
  const texto = raw.trim();
  if (!texto) return "Falta el tipo de cambio. Escríbelo en pesos por dólar.";

  const numero = interpretarMonto(texto);
  if (numero === null) {
    return "No se entiende este número. Usa solo dígitos y una coma o un punto para los decimales.";
  }
  if (numero <= 0) {
    return "El tipo de cambio tiene que ser mayor que cero: un número negativo o cero no sirve para convertir dólares a pesos.";
  }
  if (numero > TIPO_CAMBIO_MAXIMO) {
    return "Este valor parece fuera de rango. Revisa cuántos pesos cuesta un dólar.";
  }
  return null;
}

/** Papa Parse informa algunos errores en inglés; aquí se explican en español. */
function mensajeErrorCsv(error: string): string {
  if (!error.startsWith("CSV: ")) return error;

  const detalle = error.slice(5);
  if (/toofewfields/i.test(detalle)) {
    return "Una fila tiene menos columnas que la primera fila del archivo.";
  }
  if (/toomanyfields/i.test(detalle)) {
    return "Una fila tiene más columnas que la primera fila del archivo.";
  }
  if (/undetectabledelimiter/i.test(detalle)) {
    return "No se pudo reconocer el separador. Usa coma, punto y coma o tabulación.";
  }
  if (/quotes/i.test(detalle)) {
    return "Hay comillas mal cerradas en una fila.";
  }
  return "El archivo tiene un problema de formato en alguna fila.";
}

function plural(cantidad: number, singular: string, pluralTexto: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}

function listaEnEspanol(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1] ?? ""}`;
}

function claseCampo(invalido: boolean): string {
  return [
    "mt-2 h-11 min-h-11 w-full rounded-none border bg-canvas px-3 text-[15px] text-ink-900",
    "placeholder:text-ink-500 transition-colors focus-visible:border-ink-900",
    invalido ? "border-ink-900" : "border-line hover:border-ink-400",
  ].join(" ");
}

/* ------------------------------------------------------------------ */
/* Componente                                                          */
/* ------------------------------------------------------------------ */

export function TaxWizard() {
  const [estado, setEstado] = useState<EstadoWizard>(() => estadoInicial());
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [origen, setOrigen] = useState<OrigenCarga>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [intento, setIntento] = useState(0);

  const archivoRef = useRef<HTMLInputElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const pasoPrevio = useRef(estado.paso);
  const lecturaRef = useRef(0);

  const resumen = useMemo(() => resumir(estado), [estado]);

  const faltasRevision = [
    errorTipoCambio(estado.tipoCambio) ? "el tipo de cambio" : null,
    errorAnio(estado.anio) ? "el año de las operaciones" : null,
  ].filter((falta): falta is string => falta !== null);

  let motivoActual: string | null = null;
  if (estado.paso === "subir") {
    motivoActual = motivoBloqueo(estado);
  } else if (estado.paso === "revisar" && faltasRevision.length > 0) {
    motivoActual = `Revisa ${listaEnEspanol(faltasRevision)} para continuar.`;
  }

  // El foco va al título solo cuando cambia el paso: escribir nunca lo mueve.
  useEffect(() => {
    if (pasoPrevio.current === estado.paso) return;
    pasoPrevio.current = estado.paso;
    tituloRef.current?.focus();
  }, [estado.paso]);

  function cargarCsv(texto: string, desde: Exclude<OrigenCarga, null>) {
    const { operaciones, errores } = parseGenericCsv(texto);
    setOrigen(desde);
    setIntento(0);
    setEstado((previo) => ({ ...previo, operaciones, erroresCsv: errores }));
  }

  async function alElegirArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;

    const lectura = lecturaRef.current + 1;
    lecturaRef.current = lectura;
    setNombreArchivo(archivo.name);
    setOrigen("archivo");
    setLeyendo(true);

    try {
      const texto = await archivo.text();
      if (lectura !== lecturaRef.current) return;
      cargarCsv(texto, "archivo");
    } catch {
      if (lectura !== lecturaRef.current) return;
      setOrigen("archivo");
      setEstado((previo) => ({
        ...previo,
        operaciones: [],
        erroresCsv: [
          "No se pudo leer el archivo. Revisa que sea un CSV de texto y vuelve a intentarlo.",
        ],
      }));
    } finally {
      if (lectura === lecturaRef.current) {
        setLeyendo(false);
        // Permite volver a elegir el mismo archivo después de corregirlo.
        if (archivoRef.current) archivoRef.current.value = "";
      }
    }
  }

  function cargarMuestra() {
    lecturaRef.current += 1;
    setLeyendo(false);
    setNombreArchivo(null);
    if (archivoRef.current) archivoRef.current.value = "";
    cargarCsv(FORMATO_CSV_GENERICO, "muestra");
  }

  function irA(paso: Paso) {
    setIntento(0);
    setEstado((previo) => ({ ...previo, paso }));
  }

  function avanzar() {
    const siguiente = pasoSiguiente(estado.paso);
    if (!siguiente) return;

    const revisarConFaltas =
      estado.paso === "revisar" &&
      (errorTipoCambio(estado.tipoCambio) !== null || errorAnio(estado.anio) !== null);

    if (revisarConFaltas || !puedeAvanzar(estado)) {
      setIntento((previo) => previo + 1);
      if (estado.paso === "subir") archivoRef.current?.focus();
      return;
    }

    irA(siguiente);
  }

  function volver() {
    const anterior = pasoAnterior(estado.paso);
    if (anterior) irA(anterior);
  }

  function descargarCsv() {
    if (!resumen) return;
    descargarTexto(nombreArchivoCsv(estado.anio), armarCsvResumen(resumen.filas));
  }

  const numeroPaso = indicePaso(estado.paso) + 1;

  return (
    <div>
      <nav aria-label="Pasos del asistente" className="print:hidden">
        <ol className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-y border-line py-3">
          {PASOS.map((paso, indice) => {
            const actual = estado.paso === paso;
            return (
              <li key={paso} className="flex items-baseline gap-2">
                <span
                  className={
                    actual ? "num text-[13px] text-ink-900" : "num text-[13px] text-ink-500"
                  }
                >
                  {String(indice + 1).padStart(2, "0")}
                </span>
                <span
                  aria-current={actual ? "step" : undefined}
                  className={
                    actual
                      ? "text-[13px] font-medium text-ink-900"
                      : "text-[13px] text-ink-500"
                  }
                >
                  {TITULO_CORTO[paso]}
                </span>
              </li>
            );
          })}
          <li className="label-line ml-auto">
            Paso {numeroPaso} de {PASOS.length}
          </li>
        </ol>
      </nav>

      <section className="mt-8" aria-labelledby="wizard-titulo">
        <h2
          ref={tituloRef}
          tabIndex={-1}
          id="wizard-titulo"
          className="scroll-mt-24 text-[22px] font-medium tracking-[-0.03em] text-ink-900 focus:outline-none"
        >
          {TITULO_PASO[estado.paso]}
        </h2>

        {estado.paso === "subir" ? (
          <PasoSubir
            archivoRef={archivoRef}
            nombreArchivo={nombreArchivo}
            origen={origen}
            operaciones={estado.operaciones}
            errores={estado.erroresCsv}
            leyendo={leyendo}
            onArchivo={alElegirArchivo}
            onMuestra={cargarMuestra}
          />
        ) : null}

        {estado.paso === "revisar" ? (
          <PasoRevisar
            estado={estado}
            resumen={resumen}
            intento={intento}
            onTipoCambio={(valor) => setEstado((previo) => ({ ...previo, tipoCambio: valor }))}
            onAnio={(valor) => setEstado((previo) => ({ ...previo, anio: valor }))}
          />
        ) : null}

        {estado.paso === "resumen" ? (
          <PasoResumen
            estado={estado}
            resumen={resumen}
            onDescargarCsv={descargarCsv}
            onVolver={volver}
          />
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 print:hidden">
          {pasoAnterior(estado.paso) ? (
            <button
              type="button"
              onClick={volver}
              className="inline-flex min-h-11 items-center text-[15px] text-ink-900 underline underline-offset-4 transition-opacity hover:opacity-60"
            >
              Atrás
            </button>
          ) : null}
          {pasoSiguiente(estado.paso) ? (
            <Button
              type="button"
              onClick={avanzar}
              aria-describedby={motivoActual ? "wizard-motivo" : undefined}
            >
              Siguiente
            </Button>
          ) : null}
        </div>

        {motivoActual ? (
          <p
            id="wizard-motivo"
            className="mt-3 max-w-xl text-[13px] leading-relaxed text-ink-600 print:hidden"
          >
            {motivoActual}
          </p>
        ) : null}
      </section>

      <div className="mt-10 border-t border-line pt-4">
        <p className="max-w-2xl text-[13px] leading-relaxed text-ink-500">
          {DJ1929_NO_CALCULA_IMPUESTO} Este asistente no constituye asesoría tributaria. El
          archivo que se sube al SII lo entrega tu corredora.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
          Relación {RELACION_SIN_RELACION} · participación {PARTICIPACION_POR_DEFECTO} en una
          acción o ETF suelta.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pasos                                                               */
/* ------------------------------------------------------------------ */

type PasoSubirProps = {
  archivoRef: React.RefObject<HTMLInputElement | null>;
  nombreArchivo: string | null;
  origen: OrigenCarga;
  operaciones: Operacion[];
  errores: string[];
  leyendo: boolean;
  onArchivo: (evento: React.ChangeEvent<HTMLInputElement>) => void;
  onMuestra: () => void;
};

function PasoSubir({
  archivoRef,
  nombreArchivo,
  origen,
  operaciones,
  errores,
  leyendo,
  onArchivo,
  onMuestra,
}: PasoSubirProps) {
  const erroresArchivo = errores.filter((error) => !error.startsWith("Fila de datos"));
  const erroresFilas = errores.filter((error) => error.startsWith("Fila de datos"));

  const conteo =
    operaciones.length > 0
      ? plural(operaciones.length, "operación leída", "operaciones leídas")
      : null;
  const filasFallidas =
    erroresFilas.length > 0
      ? plural(erroresFilas.length, "fila no entró", "filas no entraron")
      : null;

  const mensajeEstado = leyendo
    ? "Leyendo el archivo…"
    : conteo
      ? `${origen === "muestra" ? "Caso de muestra cargado: " : ""}${conteo}.${
          filasFallidas ? ` ${filasFallidas} al cálculo.` : ""
        }`
      : errores.length > 0
        ? "No se pudo leer ninguna operación. Revisa el detalle de abajo."
        : "";

  return (
    <div className="mt-5">
      <p className="max-w-2xl text-[15px] leading-relaxed text-ink-600">
        Una fila por operación del año. El archivo se lee en tu navegador: no se envía a ningún
        servidor.
      </p>

      <div className="mt-6 border-t border-line pt-5">
        <h3 className="text-[15px] font-medium text-ink-900">Archivo de operaciones</h3>
        <p id="csv-ayuda" className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-500">
          Formato CSV con encabezados. Columnas: fecha, nombre, país, tipo, monto_usd, costo_usd,
          impuesto_retenido_usd, cantidad, tax_id, domicilio y ciudad.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
          <input
            ref={archivoRef}
            id="archivo-csv"
            name="archivo-csv"
            type="file"
            accept=".csv,text/csv"
            onChange={onArchivo}
            aria-describedby="csv-ayuda csv-estado"
            className="peer sr-only"
          />
          <label
            htmlFor="archivo-csv"
            className="inline-flex h-11 min-h-11 cursor-pointer items-center justify-center rounded-none border border-ink-900 px-4 text-[14px] font-medium text-ink-900 transition-colors hover:bg-ink-50 peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-ink-900 print:hidden"
          >
            {nombreArchivo || origen === "muestra"
              ? "Elegir otro archivo CSV"
              : "Elegir archivo CSV"}
          </label>
          <button
            type="button"
            onClick={onMuestra}
            className="inline-flex min-h-11 items-center text-left text-[14px] text-ink-900 underline underline-offset-4 transition-opacity hover:opacity-60 print:hidden"
          >
            Cargar un caso de muestra
          </button>
        </div>

        <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
          El caso de muestra es ilustrativo: son datos ficticios, no de una persona real.
        </p>

        <div id="csv-estado" aria-live="polite" aria-busy={leyendo} className="mt-4">
          {mensajeEstado ? <p className="text-[14px] text-ink-900">{mensajeEstado}</p> : null}
          {nombreArchivo ? (
            <p className="mt-1 break-words text-[13px] text-ink-500">Archivo: {nombreArchivo}</p>
          ) : null}
        </div>

        {!leyendo && operaciones.length === 0 && errores.length === 0 ? (
          <p className="mt-4 text-[13px] text-ink-500">Aún no hay operaciones cargadas.</p>
        ) : null}

        {erroresArchivo.length > 0 ? (
          <BloqueAvisos
            titulo="No pudimos usar el archivo"
            items={erroresArchivo.map(mensajeErrorCsv)}
          />
        ) : null}

        {erroresFilas.length > 0 ? (
          <BloqueAvisos
            titulo={`Filas que no entraron al cálculo (${erroresFilas.length})`}
            items={erroresFilas.map(mensajeErrorCsv)}
          />
        ) : null}
      </div>
    </div>
  );
}

type PasoRevisarProps = {
  estado: EstadoWizard;
  resumen: ResumenDJ1929 | null;
  intento: number;
  onTipoCambio: (valor: string) => void;
  onAnio: (valor: number) => void;
};

function PasoRevisar({ estado, resumen, intento, onTipoCambio, onAnio }: PasoRevisarProps) {
  const [tocoTc, setTocoTc] = useState(false);
  const [tocoAnio, setTocoAnio] = useState(false);
  const resumenErroresRef = useRef<HTMLDivElement>(null);
  const intentoPrevio = useRef(intento);

  const errorTc = errorTipoCambio(estado.tipoCambio);
  const errorAnioActual = errorAnio(estado.anio);
  const mostrarTc = (tocoTc || intento > 0) && errorTc !== null;
  const mostrarAnio = (tocoAnio || intento > 0) && errorAnioActual !== null;

  const nombresErrores = [
    intento > 0 && errorTc !== null ? "el tipo de cambio" : null,
    intento > 0 && errorAnioActual !== null ? "el año de las operaciones" : null,
  ].filter((nombre): nombre is string => nombre !== null);

  const erroresArchivo = estado.erroresCsv.filter((error) => !error.startsWith("Fila de datos"));
  const erroresFilas = estado.erroresCsv.filter((error) => error.startsWith("Fila de datos"));

  // Al intentar avanzar con campos inválidos, el resumen toma el foco.
  useEffect(() => {
    if (intento === 0 || intento === intentoPrevio.current) return;
    intentoPrevio.current = intento;
    resumenErroresRef.current?.focus();
  }, [intento]);

  return (
    <div className="mt-5">
      {nombresErrores.length > 0 ? (
        <div
          ref={resumenErroresRef}
          tabIndex={-1}
          aria-live="polite"
          className="max-w-2xl border-l-2 border-ink-900 pl-4 focus:outline-none"
        >
          <p className="text-[14px] font-medium text-ink-900">
            Revisa {listaEnEspanol(nombresErrores)} antes de continuar.
          </p>
          <ul className="mt-1.5 space-y-1 text-[13px] leading-relaxed text-ink-600">
            {mostrarTc && errorTc ? <li>{errorTc}</li> : null}
            {mostrarAnio && errorAnioActual ? <li>{errorAnioActual}</li> : null}
          </ul>
        </div>
      ) : null}

      <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-600">
        Los montos están en dólares. El tipo de cambio que ingreses los convierte a pesos para la
        sección B.
      </p>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="min-w-0">
          <label
            htmlFor="tipo-cambio"
            className="text-[14px] font-medium tracking-[-0.01em] text-ink-900"
          >
            Tipo de cambio al 31.12
          </label>
          <p id="tipo-cambio-ayuda" className="mt-1 text-[13px] leading-relaxed text-ink-500">
            Pesos por dólar. Lo ingresas tú: no se consulta al Banco Central ni se asume un valor.
          </p>
          <input
            id="tipo-cambio"
            name="tipo-cambio"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={estado.tipoCambio}
            onChange={(evento) => onTipoCambio(evento.target.value)}
            onBlur={() => setTocoTc(true)}
            aria-required="true"
            aria-invalid={mostrarTc ? true : undefined}
            aria-describedby={mostrarTc ? "tipo-cambio-error" : "tipo-cambio-ayuda"}
            className={claseCampo(mostrarTc)}
          />
          {mostrarTc && errorTc ? (
            <p
              id="tipo-cambio-error"
              className="mt-1.5 text-[13px] font-medium leading-relaxed text-ink-900"
            >
              {errorTc}
            </p>
          ) : null}
        </div>

        <div className="min-w-0">
          <label
            htmlFor="anio-operaciones"
            className="text-[14px] font-medium tracking-[-0.01em] text-ink-900"
          >
            Año de las operaciones
          </label>
          <p id="anio-ayuda" className="mt-1 text-[13px] leading-relaxed text-ink-500">
            {anioEsValido(estado.anio)
              ? `Las operaciones de ${estado.anio} se declaran en ${estado.anio + 1}.`
              : "Escribe el año de las operaciones: la DJ se presenta el año siguiente."}
          </p>
          <input
            id="anio-operaciones"
            name="anio-operaciones"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={Number.isInteger(estado.anio) ? String(estado.anio) : ""}
            onChange={(evento) => {
              const digitos = evento.target.value.replace(/\D/g, "").slice(0, 4);
              onAnio(digitos === "" ? Number.NaN : Number(digitos));
            }}
            onBlur={() => setTocoAnio(true)}
            aria-required="true"
            aria-invalid={mostrarAnio ? true : undefined}
            aria-describedby={mostrarAnio ? "anio-error" : "anio-ayuda"}
            className={claseCampo(mostrarAnio)}
          />
          {mostrarAnio && errorAnioActual ? (
            <p
              id="anio-error"
              className="mt-1.5 text-[13px] font-medium leading-relaxed text-ink-900"
            >
              {errorAnioActual}
            </p>
          ) : null}
        </div>
      </div>

      <section className="mt-8 border-t border-line pt-6" aria-labelledby="operaciones-titulo">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="operaciones-titulo" className="text-[15px] font-medium text-ink-900">
            Operaciones leídas ({estado.operaciones.length})
          </h3>
          <p className="label-line">Montos en dólares</p>
        </div>

        {estado.operaciones.length === 0 ? (
          <p className="mt-3 text-[13px] text-ink-500">
            No hay operaciones cargadas. Vuelve al paso anterior para subir el CSV.
          </p>
        ) : (
          <>
            <div
              role="region"
              aria-label="Operaciones leídas, montos en dólares"
              tabIndex={0}
              className="mt-3 overflow-x-auto focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-ink-900 print:overflow-visible"
            >
              <table className="w-full min-w-[640px] border-collapse text-left text-[14px] print:min-w-0 print:text-[10px]">
                <caption className="sr-only">
                  Operaciones leídas para la DJ 1929, con montos en dólares.
                </caption>
                <thead>
                  <tr className="border-b border-line text-[13px] text-ink-500">
                    <th scope="col" className="py-2 pr-4 font-normal">
                      Fecha
                    </th>
                    <th scope="col" className="py-2 pr-4 font-normal">
                      Nombre
                    </th>
                    <th scope="col" className="py-2 pr-4 font-normal">
                      País
                    </th>
                    <th scope="col" className="py-2 pr-4 font-normal">
                      Tipo
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-normal">
                      Monto USD
                    </th>
                    <th scope="col" className="py-2 text-right font-normal">
                      Costo USD
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {estado.operaciones.map((operacion, indice) => (
                    <tr key={indice} className="border-b border-line">
                      <td className="py-2 pr-4 text-ink-600">{operacion.fecha ?? "Sin fecha"}</td>
                      <td className="py-2 pr-4 text-ink-900">{operacion.nombre}</td>
                      <td className="py-2 pr-4 text-ink-600">{operacion.pais}</td>
                      <td className="py-2 pr-4 text-ink-600">{operacion.tipo}</td>
                      <td className="num whitespace-nowrap py-2 pr-4 text-right text-ink-900">
                        {formatoUsd(operacion.montoUsd)}
                      </td>
                      <td className="num whitespace-nowrap py-2 text-right text-ink-600">
                        {operacion.costoUsd === undefined
                          ? "Sin costo"
                          : formatoUsd(operacion.costoUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[13px] text-ink-500 md:hidden print:hidden">
              La tabla se desplaza en horizontal para ver todas las columnas.
            </p>
          </>
        )}

        {erroresArchivo.length > 0 ? (
          <BloqueAvisos titulo="Archivo" items={erroresArchivo.map(mensajeErrorCsv)} />
        ) : null}

        {erroresFilas.length > 0 ? (
          <BloqueAvisos
            titulo={`Filas que no entraron al cálculo (${erroresFilas.length})`}
            items={erroresFilas.map(mensajeErrorCsv)}
          />
        ) : null}

        {resumen && resumen.avisos.length > 0 ? (
          <BloqueAvisos titulo="Revisa antes de declarar" items={resumen.avisos} />
        ) : null}
      </section>
    </div>
  );
}

type PasoResumenProps = {
  estado: EstadoWizard;
  resumen: ResumenDJ1929 | null;
  onDescargarCsv: () => void;
  onVolver: () => void;
};

function PasoResumen({ estado, resumen, onDescargarCsv, onVolver }: PasoResumenProps) {
  const [descargado, setDescargado] = useState(false);

  if (!resumen || resumen.filas.length === 0) {
    return (
      <div className="mt-5">
        <p className="max-w-2xl text-[15px] leading-relaxed text-ink-600">
          No hay filas para la sección B con estas operaciones. Vuelve al paso anterior para
          revisar las filas que no entraron al cálculo y el tipo de cambio.
        </p>
        <button
          type="button"
          onClick={onVolver}
          className="mt-4 inline-flex min-h-11 items-center text-[15px] text-ink-900 underline underline-offset-4 transition-opacity hover:opacity-60 print:hidden"
        >
          Volver a revisar
        </button>
      </div>
    );
  }

  const { filas, totales } = resumen;
  const tipoCambio = parsearTipoCambio(estado.tipoCambio);

  return (
    <div className="mt-5">
      <p className="max-w-2xl text-[15px] leading-relaxed text-ink-600">
        Montos en pesos para la sección B, con el tipo de cambio que ingresaste. Un cero significa
        dejar el casillero vacío en el SII.
      </p>

      <h3 className="mt-8 text-[15px] font-medium text-ink-900">Detalle por instrumento</h3>

      <div
        role="region"
        aria-label="Tabla de la sección B, montos en pesos"
        tabIndex={0}
        className="mt-3 overflow-x-auto focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-ink-900 print:overflow-visible"
      >
        <table className="w-full min-w-[760px] border-collapse text-left text-[13px] print:min-w-0 print:text-[10px]">
          <caption className="sr-only">
            Montos en pesos chilenos por instrumento y código de operación para la sección B de la
            DJ 1929.
          </caption>
          <thead>
            <tr className="border-b border-line text-[13px] text-ink-500">
              <th scope="col" className="py-2 pr-4 font-normal">
                Operación
              </th>
              <th scope="col" className="py-2 pr-4 font-normal">
                Nombre
              </th>
              <th scope="col" className="py-2 pr-4 font-normal">
                País
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">
                Monto 31.12
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">
                Rentas
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal">
                Pérdidas
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Impuesto retenido
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr
                key={`${fila.nombre}|${fila.pais}|${fila.codigo}`}
                className="border-b border-line align-top print:break-inside-avoid"
              >
                <td className="py-3 pr-4 text-ink-600">
                  {ETIQUETA_CODIGO[fila.codigo] ?? fila.codigo}
                </td>
                <td className="py-3 pr-4">
                  <span className="text-ink-900">{fila.nombre}</span>
                  {fila.taxId ? (
                    <span className="block text-[13px] text-ink-500">{fila.taxId}</span>
                  ) : null}
                  {fila.domicilio || fila.ciudad ? (
                    <span className="block text-[13px] text-ink-500">
                      {[fila.domicilio, fila.ciudad].filter(Boolean).join(", ")}
                    </span>
                  ) : null}
                </td>
                <td className="py-3 pr-4 text-ink-600">{fila.pais}</td>
                <td className="num whitespace-nowrap py-3 pr-4 text-right text-ink-900">
                  {formatoClp(fila.monto31DicClp)}
                </td>
                <td className="num whitespace-nowrap py-3 pr-4 text-right text-ink-900">
                  {formatoClp(fila.rentasClp)}
                </td>
                <td className="num whitespace-nowrap py-3 pr-4 text-right text-ink-900">
                  {formatoClp(fila.perdidasClp)}
                </td>
                <td className="num whitespace-nowrap py-3 text-right text-ink-900">
                  {formatoClp(fila.impuestoRetenidoClp)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-ink-900 text-[13px]">
              <td className="py-3 pr-4 font-medium text-ink-900" colSpan={3}>
                Total ({plural(totales.casos, "fila", "filas")})
              </td>
              <td className="num whitespace-nowrap py-3 pr-4 text-right text-ink-900">
                {formatoClp(totales.monto31DicClp)}
              </td>
              <td className="num whitespace-nowrap py-3 pr-4 text-right text-ink-900">
                {formatoClp(totales.rentasClp)}
              </td>
              <td className="num whitespace-nowrap py-3 pr-4 text-right text-ink-900">
                {formatoClp(totales.perdidasClp)}
              </td>
              <td className="num whitespace-nowrap py-3 text-right text-ink-900">
                {formatoClp(totales.impuestoRetenidoClp)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-2 text-[13px] text-ink-500 md:hidden print:hidden">
        La tabla se desplaza en horizontal para ver todas las columnas.
      </p>

      <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
        Tipo de cambio usado:{" "}
        {tipoCambio === null ? "sin dato" : `${formatoUsd(tipoCambio)} pesos por dólar`}. Año de
        las operaciones: {estado.anio}.
      </p>

      {resumen.avisos.length > 0 ? (
        <BloqueAvisos titulo="Revisa antes de declarar" items={resumen.avisos} />
      ) : null}

      <div className="mt-8 print:hidden">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Button
            type="button"
            onClick={() => {
              onDescargarCsv();
              setDescargado(true);
            }}
          >
            Descargar CSV
          </Button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-11 items-center text-[15px] text-ink-900 underline underline-offset-4 transition-opacity hover:opacity-60"
          >
            Imprimir o guardar como PDF
          </button>
        </div>
        {descargado ? (
          <p role="status" className="mt-3 text-[13px] text-ink-500">
            Descarga iniciada: {nombreArchivoCsv(estado.anio)}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function BloqueAvisos({ titulo, items }: { titulo: string; items: readonly string[] }) {
  if (items.length === 0) return null;

  return (
    <div className="mt-6 border-t border-line pt-4">
      <h3 className="text-[14px] font-medium text-ink-900">{titulo}</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-ink-600 marker:text-ink-500">
        {items.map((item, indice) => (
          <li key={indice}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Descarga local con Blob. No pasa por ningún servidor. */
function descargarTexto(nombre: string, contenido: string) {
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}
