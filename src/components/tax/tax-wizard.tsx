"use client";

/**
 * Asistente paso a paso de la DJ 1929 (F43).
 *
 * Todo corre en el navegador: el CSV se lee con `File.text()` y no se envía
 * a ningún servidor. Este archivo **no** usa `fetch` ni ningún otro envío.
 * Solo ordena los montos que la DJ 1929 pide en la sección B. No calcula el
 * impuesto a pagar ni reemplaza la declaración en el SII.
 */

import { useMemo, useRef, useState } from "react";
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
  return `resumen-dj1929-reclu-${anio}.csv`;
}

export function nombreArchivoImportado(): string {
  return "operaciones-dj1929-reclu.csv";
}

/* ------------------------------------------------------------------ */
/* Datos de referencia                                                 */
/* ------------------------------------------------------------------ */

export { PLAZOS, GUIAS_OFICIALES } from "@/lib/tax/plazos";

export function TaxWizard() {
  const [estado, setEstado] = useState<EstadoWizard>(() => estadoInicial());
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  const resumen = useMemo(() => resumir(estado), [estado]);
  const bloqueo = motivoBloqueo(estado);

  function cargarCsv(texto: string) {
    const { operaciones, errores } = parseGenericCsv(texto);
    setEstado((previo) => ({ ...previo, operaciones, erroresCsv: errores }));
  }

  async function alElegirArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    const texto = await archivo.text();
    setNombreArchivo(archivo.name);
    cargarCsv(texto);
  }

  function usarEjemplo() {
    setNombreArchivo(null);
    cargarCsv(FORMATO_CSV_GENERICO);
    if (archivoRef.current) archivoRef.current.value = "";
  }

  function irA(paso: Paso) {
    setEstado((previo) => ({ ...previo, paso }));
  }

  function avanzar() {
    const siguiente = pasoSiguiente(estado.paso);
    if (siguiente && puedeAvanzar(estado)) irA(siguiente);
  }

  function volver() {
    const anterior = pasoAnterior(estado.paso);
    if (anterior) irA(anterior);
  }

  function descargarCsv() {
    if (!resumen) return;
    const contenido = armarCsvResumen(resumen.filas);
    descargarTexto(nombreArchivoCsv(estado.anio), contenido);
  }

  return (
    <div>
      <ol className="flex flex-wrap gap-x-6 gap-y-2 border-y border-ink-200 py-3 label-line print:hidden">
        {PASOS.map((paso, indice) => {
          const activo = estado.paso === paso;
          const alcanzable = indice <= indicePaso(estado.paso);
          return (
            <li key={paso} className="flex items-center gap-2">
              <span
                className={
                  activo
                    ? "text-ink-900"
                    : alcanzable
                      ? "text-ink-600"
                      : "text-ink-300"
                }
              >
                {String(indice + 1).padStart(2, "0")} {TITULO_PASO[paso]}
              </span>
            </li>
          );
        })}
      </ol>

      <section className="mt-8">
        <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
          {TITULO_PASO[estado.paso]}
        </h2>

        {estado.paso === "subir" ? (
          <PasoSubir
            archivoRef={archivoRef}
            nombreArchivo={nombreArchivo}
            operaciones={estado.operaciones}
            errores={estado.erroresCsv}
            onArchivo={alElegirArchivo}
            onEjemplo={usarEjemplo}
          />
        ) : null}

        {estado.paso === "revisar" ? (
          <PasoRevisar
            estado={estado}
            resumen={resumen}
            onTipoCambio={(valor) => setEstado((previo) => ({ ...previo, tipoCambio: valor }))}
            onAnio={(valor) => setEstado((previo) => ({ ...previo, anio: valor }))}
          />
        ) : null}

        {estado.paso === "resumen" ? (
          <PasoResumen estado={estado} resumen={resumen} onDescargarCsv={descargarCsv} />
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-4 print:hidden">
          {pasoAnterior(estado.paso) ? (
            <Button variant="ghost" onClick={volver}>
              Atrás
            </Button>
          ) : null}
          {pasoSiguiente(estado.paso) ? (
            <Button onClick={avanzar} disabled={!puedeAvanzar(estado)}>
              Continuar
            </Button>
          ) : (
            <Button variant="ghost" onClick={descargarCsv} disabled={!resumen}>
              Descargar CSV
            </Button>
          )}
          {bloqueo ? <p className="label-line max-w-sm">{bloqueo}</p> : null}
        </div>
      </section>

      <p className="mt-10 border-t border-ink-200 pt-4 text-[12px] leading-relaxed text-ink-500">
        {DJ1929_NO_CALCULA_IMPUESTO} El archivo que recibe el SII lo entrega tu
        corredora; este asistente no lo reemplaza. Relación {RELACION_SIN_RELACION} ·
        participación {PARTICIPACION_POR_DEFECTO} en una acción o ETF suelta.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pasos                                                              */
/* ------------------------------------------------------------------ */

type PasoSubirProps = {
  archivoRef: React.RefObject<HTMLInputElement | null>;
  nombreArchivo: string | null;
  operaciones: Operacion[];
  errores: string[];
  onArchivo: (evento: React.ChangeEvent<HTMLInputElement>) => void;
  onEjemplo: () => void;
};

function PasoSubir({
  archivoRef,
  nombreArchivo,
  operaciones,
  errores,
  onArchivo,
  onEjemplo,
}: PasoSubirProps) {
  return (
    <div className="mt-5">
      <p className="max-w-2xl text-[15px] leading-relaxed text-ink-600">
        Sube un CSV con una fila por operación del año. Se lee en tu navegador:
        nada se envía a un servidor. Columnas: fecha, nombre, país, tipo,
        monto_usd, costo_usd, impuesto_retenido_usd, cantidad, tax_id, domicilio
        y ciudad.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-3">
          <span className="sr-only">Archivo CSV de operaciones</span>
          <input
            ref={archivoRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onArchivo}
            className="block w-full max-w-sm text-[14px] text-ink-600 file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink-900 file:px-4 file:py-2 file:text-[14px] file:text-white hover:file:bg-black"
          />
        </label>
        <Button variant="ghost" onClick={onEjemplo} className="print:hidden">
          Usar datos de ejemplo
        </Button>
      </div>

      {nombreArchivo ? (
        <p className="mt-3 text-[13px] text-ink-500">{nombreArchivo}</p>
      ) : null}

      {operaciones.length > 0 ? (
        <p className="mt-4 text-[14px] text-ink-900">
          {operaciones.length} operación(es) leída(s).
        </p>
      ) : null}

      {errores.length > 0 ? <Avisos titulo="Filas con problemas" items={errores} /> : null}
    </div>
  );
}

type PasoRevisarProps = {
  estado: EstadoWizard;
  resumen: ResumenDJ1929 | null;
  onTipoCambio: (valor: string) => void;
  onAnio: (valor: number) => void;
};

function PasoRevisar({ estado, resumen, onTipoCambio, onAnio }: PasoRevisarProps) {
  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-6">
        <label className="flex max-w-xs flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-900">
            Tipo de cambio al 31.12 (pesos por dólar)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={estado.tipoCambio}
            onChange={(evento) => onTipoCambio(evento.target.value)}
            placeholder="Por ejemplo 900"
            className="h-11 w-full rounded-none border border-ink-200 bg-white px-3 text-[15px] text-ink-900 placeholder:text-ink-500 focus:border-ink-900 focus:outline-none"
          />
          <span className="text-xs text-ink-600">
            Lo ingresas tú. No se consulta al Banco Central ni se usa un dólar de
            ejemplo.
          </span>
        </label>

        <label className="flex max-w-xs flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-900">Año de las operaciones</span>
          <input
            type="number"
            min={1990}
            max={2100}
            value={estado.anio}
            onChange={(evento) => onAnio(Number(evento.target.value))}
            className="h-11 w-full rounded-none border border-ink-200 bg-white px-3 text-[15px] text-ink-900 focus:border-ink-900 focus:outline-none"
          />
          <span className="text-xs text-ink-600">
            Las operaciones de {estado.anio} se declaran en {estado.anio + 1}.
          </span>
        </label>
      </div>

      <h3 className="mt-8 text-[15px] font-medium text-ink-900">
        Operaciones leídas ({estado.operaciones.length})
      </h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-b border-ink-200 text-[12px] text-ink-500">
              <th className="py-2 pr-4 font-normal">Fecha</th>
              <th className="py-2 pr-4 font-normal">Nombre</th>
              <th className="py-2 pr-4 font-normal">País</th>
              <th className="py-2 pr-4 font-normal">Tipo</th>
              <th className="py-2 pr-4 text-right font-normal">Monto USD</th>
              <th className="py-2 text-right font-normal">Costo USD</th>
            </tr>
          </thead>
          <tbody>
            {estado.operaciones.map((op, indice) => (
              <tr key={indice} className="border-b border-ink-100">
                <td className="py-2 pr-4 text-ink-600">{op.fecha ?? "—"}</td>
                <td className="py-2 pr-4 text-ink-900">{op.nombre}</td>
                <td className="py-2 pr-4 text-ink-600">{op.pais}</td>
                <td className="py-2 pr-4 text-ink-600">{op.tipo}</td>
                <td className="num py-2 pr-4 text-right text-ink-900">
                  {formatoUsd(op.montoUsd)}
                </td>
                <td className="num py-2 text-right text-ink-600">
                  {op.costoUsd === undefined ? "—" : formatoUsd(op.costoUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {estado.erroresCsv.length > 0 ? (
        <Avisos titulo="Filas que no entraron al cálculo" items={estado.erroresCsv} />
      ) : null}
      {resumen && resumen.avisos.length > 0 ? (
        <Avisos titulo="Revisa antes de declarar" items={resumen.avisos} />
      ) : null}
    </div>
  );
}

type PasoResumenProps = {
  estado: EstadoWizard;
  resumen: ResumenDJ1929 | null;
  onDescargarCsv: () => void;
};

function PasoResumen({ estado, resumen, onDescargarCsv }: PasoResumenProps) {
  if (!resumen || resumen.filas.length === 0) {
    return (
      <p className="mt-5 text-[15px] text-ink-600">
        No hay filas para resumir. Vuelve y revisa las operaciones.
      </p>
    );
  }

  const { filas, totales } = resumen;

  return (
    <div className="mt-5">
      <p className="max-w-2xl text-[15px] leading-relaxed text-ink-600">
        Montos en pesos para la sección B, con el tipo de cambio que ingresaste.
        Cero significa dejar el casillero vacío en el SII.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-ink-200 text-[12px] text-ink-500">
              <th className="py-2 pr-4 font-normal">Operación</th>
              <th className="py-2 pr-4 font-normal">Nombre</th>
              <th className="py-2 pr-4 font-normal">País</th>
              <th className="py-2 pr-4 text-right font-normal">Monto 31.12</th>
              <th className="py-2 pr-4 text-right font-normal">Rentas</th>
              <th className="py-2 pr-4 text-right font-normal">Pérdidas</th>
              <th className="py-2 text-right font-normal">Impuesto retenido</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr
                key={`${fila.nombre}|${fila.pais}|${fila.codigo}`}
                className="border-b border-ink-100 align-top"
              >
                <td className="py-3 pr-4 text-ink-600">
                  {ETIQUETA_CODIGO[fila.codigo] ?? fila.codigo}
                </td>
                <td className="py-3 pr-4">
                  <span className="text-ink-900">{fila.nombre}</span>
                  {fila.taxId ? (
                    <span className="block text-[12px] text-ink-500">{fila.taxId}</span>
                  ) : null}
                  {fila.domicilio || fila.ciudad ? (
                    <span className="block text-[12px] text-ink-500">
                      {[fila.domicilio, fila.ciudad].filter(Boolean).join(", ")}
                    </span>
                  ) : null}
                </td>
                <td className="py-3 pr-4 text-ink-600">{fila.pais}</td>
                <td className="num py-3 pr-4 text-right text-ink-900">
                  {formatoClp(fila.monto31DicClp)}
                </td>
                <td className="num py-3 pr-4 text-right text-ink-900">
                  {formatoClp(fila.rentasClp)}
                </td>
                <td className="num py-3 pr-4 text-right text-ink-900">
                  {formatoClp(fila.perdidasClp)}
                </td>
                <td className="num py-3 text-right text-ink-900">
                  {formatoClp(fila.impuestoRetenidoClp)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-ink-900 text-[13px]">
              <td className="py-3 pr-4 text-ink-900" colSpan={3}>
                Total ({totales.casos} fila(s))
              </td>
              <td className="num py-3 pr-4 text-right text-ink-900">
                {formatoClp(totales.monto31DicClp)}
              </td>
              <td className="num py-3 pr-4 text-right text-ink-900">
                {formatoClp(totales.rentasClp)}
              </td>
              <td className="num py-3 pr-4 text-right text-ink-900">
                {formatoClp(totales.perdidasClp)}
              </td>
              <td className="num py-3 text-right text-ink-900">
                {formatoClp(totales.impuestoRetenidoClp)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-[12px] text-ink-500">
        Tipo de cambio usado: {formatoClp(parsearTipoCambio(estado.tipoCambio) ?? 0)} pesos
        por dólar. Año de las operaciones: {estado.anio}.
      </p>

      <div className="mt-6 flex flex-wrap gap-4 print:hidden">
        <Button onClick={onDescargarCsv}>Descargar CSV</Button>
        <Button variant="outline" onClick={() => window.print()}>
          Imprimir / Guardar como PDF
        </Button>
      </div>

      {resumen.avisos.length > 0 ? (
        <Avisos titulo="Revisa antes de declarar" items={resumen.avisos} />
      ) : null}
    </div>
  );
}

function Avisos({ titulo, items }: { titulo: string; items: readonly string[] }) {
  return (
    <div className="mt-6 border-t border-ink-200 pt-4">
      <p className="text-[13px] font-medium text-ink-900">{titulo}</p>
      <ul className="mt-2 space-y-1 text-[13px] leading-relaxed text-ink-600">
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
