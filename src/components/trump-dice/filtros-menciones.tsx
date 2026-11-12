import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Filtros y orden de /trump-dice sin estado en el cliente: cada opción es un
 * enlace que deja el parámetro en la URL y el servidor vuelve a renderizar la
 * página. Los href se arman acá (en el servidor), conservan los demás
 * parámetros y anclan a #menciones para no devolver al usuario al tope.
 */

export type OrdenMenciones = "reciente" | "retorno" | "alfabetico";

export interface OpcionFiltro {
  value: string;
  label: string;
}

export interface FiltrosMencionesProps {
  /** Tipos presentes en las menciones, del más frecuente al menos. */
  tipos: readonly OpcionFiltro[];
  /** Años con menciones, del más nuevo al más viejo. */
  anios: readonly string[];
  tipo: string | null;
  anio: string | null;
  orden: OrdenMenciones;
  /** Menciones que quedan con los filtros activos. */
  visibles: number;
  /** Menciones verificadas en total. */
  total: number;
  /** searchParams de la página: los otros parámetros se conservan. */
  params: Readonly<Record<string, string | string[] | undefined>>;
  basePath?: string;
}

const ANCLA = "menciones";

const ORDENES: readonly { value: OrdenMenciones; label: string }[] = [
  { value: "reciente", label: "Reciente" },
  { value: "retorno", label: "Retorno" },
  { value: "alfabetico", label: "Alfabético" },
];

function primero(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const clean = raw?.trim();
  return clean ? clean : null;
}

/** Mismo path con `key` cambiado (null lo quita); conserva el resto de parámetros. */
function hrefCon(
  params: FiltrosMencionesProps["params"],
  basePath: string,
  key: "tipo" | "anio" | "orden",
  value: string | null,
): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === key) continue;
    const raw = primero(v);
    if (!raw) continue;
    // El orden por defecto (o uno inválido) no se arrastra: la URL queda limpia.
    if (k === "orden" && raw !== "retorno" && raw !== "alfabetico") continue;
    search.set(k, raw);
  }
  if (value && !(key === "orden" && value === "reciente")) search.set(key, value);
  const qs = search.toString();
  return `${basePath}${qs ? `?${qs}` : ""}#${ANCLA}`;
}

/** Quita los tres parámetros del listado y conserva el resto. */
function hrefLimpiar(params: FiltrosMencionesProps["params"], basePath: string): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "tipo" || k === "anio" || k === "orden") continue;
    const raw = primero(v);
    if (raw) search.set(k, raw);
  }
  const qs = search.toString();
  return `${basePath}${qs ? `?${qs}` : ""}#${ANCLA}`;
}

/** Píldora de 40px de alto, filete de 1px y activo invertido. */
function Pill({ href, activo, children }: { href: string; activo: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={activo ? "true" : undefined}
      className={cn(
        "inline-flex h-10 shrink-0 items-center whitespace-nowrap border px-3 text-[13px] transition-colors",
        activo
          ? "border-ink-900 bg-ink-900 font-medium text-white dark:border-white dark:bg-white dark:text-ink-900"
          : "border-ink-300 text-ink-600 hover:border-ink-900 hover:text-ink-900 dark:border-white/15 dark:text-white/70 dark:hover:border-white dark:hover:text-white",
      )}
    >
      {children}
    </Link>
  );
}

/** Fila con etiqueta fija y píldoras con scroll horizontal contenido en móvil. */
function Grupo({ id, etiqueta, children }: { id: string; etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-3">
      <p id={id} className="label-line w-10 shrink-0 sm:w-12">
        {etiqueta}
      </p>
      <ul
        role="list"
        aria-labelledby={id}
        className="no-scrollbar -mx-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-1 py-1"
      >
        {children}
      </ul>
    </div>
  );
}

export function FiltrosMenciones({
  tipos,
  anios,
  tipo,
  anio,
  orden,
  visibles,
  total,
  params,
  basePath = "/trump-dice",
}: FiltrosMencionesProps) {
  const tipoCrudo = primero(params.tipo);
  const anioCrudo = primero(params.anio);
  const filtraLista = Boolean(tipoCrudo || anioCrudo);
  const hayCambios = filtraLista || orden !== "reciente";

  return (
    <nav aria-label="Filtros de menciones" className="mt-5 border-y border-ink-300 py-4 dark:border-white/12">
      <div className="flex flex-col gap-1">
        <Grupo id="td-filtro-tipo" etiqueta="Tipo">
          <li>
            <Pill href={hrefCon(params, basePath, "tipo", null)} activo={tipo === null}>
              Todos
            </Pill>
          </li>
          {tipos.map((opcion) => (
            <li key={opcion.value}>
              <Pill href={hrefCon(params, basePath, "tipo", opcion.value)} activo={tipo === opcion.value}>
                {opcion.label}
              </Pill>
            </li>
          ))}
        </Grupo>

        <Grupo id="td-filtro-anio" etiqueta="Año">
          <li>
            <Pill href={hrefCon(params, basePath, "anio", null)} activo={anio === null}>
              Todos
            </Pill>
          </li>
          {anios.map((year) => (
            <li key={year}>
              <Pill href={hrefCon(params, basePath, "anio", year)} activo={anio === year}>
                {year}
              </Pill>
            </li>
          ))}
        </Grupo>

        <Grupo id="td-filtro-orden" etiqueta="Orden">
          {ORDENES.map((opcion) => (
            <li key={opcion.value}>
              <Pill href={hrefCon(params, basePath, "orden", opcion.value)} activo={orden === opcion.value}>
                {opcion.label}
              </Pill>
            </li>
          ))}
        </Grupo>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-1 border-t border-ink-300 pt-3 dark:border-white/12">
        <div className="min-w-0">
          <p className="label-line" aria-live="polite" aria-atomic="true">
            <span className="num text-ink-900 dark:text-white">{visibles}</span> de{" "}
            <span className="num">{total}</span> {total === 1 ? "mención" : "menciones"}
          </p>
          {filtraLista ? (
            <p className="mt-1 text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
              Los indicadores y el ranking cubren todas las menciones.
            </p>
          ) : null}
        </div>
        {hayCambios ? (
          <Link
            href={hrefLimpiar(params, basePath)}
            aria-label="Limpiar filtros y orden"
            className="inline-flex h-10 shrink-0 items-center text-[13px] font-medium text-ink-900 underline decoration-1 underline-offset-4 transition-colors hover:no-underline dark:text-white"
          >
            Limpiar
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
