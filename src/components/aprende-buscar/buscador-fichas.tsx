"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";

/**
 * Datos mínimos de una ficha para el listado. Se pasan desde el servidor sin
 * `cuerpo` ni `fuentes` para no enviar de más al cliente.
 */
export type FichaListado = {
  slug: string;
  titulo: string;
  resumen: string;
};

/** Búsqueda sin mayúsculas ni tildes: "credito" encuentra "crédito". */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Buscador de fichas de /aprende.
 *
 * El filtro se calcula en el render y el estado solo guarda la consulta: el
 * HTML inicial (SSR) ya trae todas las fichas, así que el buscador no esconde
 * contenido a los buscadores ni necesita `useEffect`. Escape limpia y el foco
 * vuelve al campo, donde se queda mientras se escribe.
 */
export function BuscadorFichas({ fichas }: { fichas: readonly FichaListado[] }) {
  const [consulta, setConsulta] = useState("");
  const campoRef = useRef<HTMLInputElement>(null);

  const termino = normalizar(consulta.trim());
  const visibles = fichas
    .map((ficha, indice) => ({ ficha, indice }))
    .filter(({ ficha }) =>
      termino.length === 0
        ? true
        : normalizar(`${ficha.titulo} ${ficha.resumen}`).includes(termino),
    );

  const total = visibles.length;
  const contador =
    total === 0 ? "Sin resultados" : total === 1 ? "1 ficha" : `${total} fichas`;

  function limpiar() {
    setConsulta("");
    campoRef.current?.focus();
  }

  return (
    <div>
      <div
        role="search"
        aria-label="Buscar en las fichas"
        className="border-b border-ink-300 pb-6 dark:border-white/12"
      >
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor="buscador-fichas" className="label-line">
            Buscar en las fichas
          </label>
          <p
            role="status"
            aria-live="polite"
            className="num shrink-0 text-[12px] text-ink-500 dark:text-ink-400"
          >
            {contador}
          </p>
        </div>

        <div className="relative mt-2 w-full max-w-lg">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500 dark:text-ink-400"
            strokeWidth={1.75}
          />
          <input
            ref={campoRef}
            id="buscador-fichas"
            type="search"
            value={consulta}
            onChange={(event) => setConsulta(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && consulta.length > 0) {
                event.preventDefault();
                limpiar();
              }
            }}
            placeholder="Formulario 13F, PTR, AFP…"
            autoComplete="off"
            enterKeyHint="search"
            className="h-11 w-full border border-ink-300 bg-white pr-12 pl-10 text-[15px] text-ink-900 transition-colors placeholder:text-ink-500 hover:border-ink-400 focus:border-ink-900 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ink-900 dark:border-white/15 dark:bg-ink-950 dark:text-white dark:placeholder:text-ink-400 dark:hover:border-white/30 dark:focus:border-white dark:focus-visible:outline-white [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
          />
          {consulta.length > 0 ? (
            <button
              type="button"
              onClick={limpiar}
              aria-label="Limpiar búsqueda"
              className="absolute top-1/2 right-0.5 inline-flex size-10 -translate-y-1/2 items-center justify-center text-ink-500 transition-colors hover:text-ink-900 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-ink-900 dark:text-ink-400 dark:hover:text-white dark:focus-visible:outline-white"
            >
              <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      </div>

      {visibles.length > 0 ? (
        <ul>
          {visibles.map(({ ficha, indice }) => (
            <li key={ficha.slug} className="border-b border-ink-300 dark:border-white/12">
              <Link href={`/aprende/${ficha.slug}`} className="group flex gap-4 py-7 sm:gap-6">
                <span
                  aria-hidden="true"
                  className="num mt-1.5 w-6 shrink-0 text-[12px] text-ink-500 dark:text-ink-400"
                >
                  {String(indice + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900 transition-colors group-hover:text-ink-600 dark:text-white dark:group-hover:text-ink-300">
                    {ficha.titulo}
                  </h2>
                  <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-ink-600 dark:text-ink-400">
                    {ficha.resumen}
                  </p>
                  <span className="mt-4 inline-block border-b border-ink-900 pb-0.5 text-[12px] font-medium text-ink-900 dark:border-white dark:text-white">
                    Leer la ficha
                  </span>
                </div>
                <span
                  aria-hidden="true"
                  className="hidden shrink-0 self-center text-ink-400 transition-transform group-hover:translate-x-1 sm:block dark:text-ink-500"
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-b border-ink-300 py-12 dark:border-white/12">
          <p className="max-w-[46ch] text-[17px] font-medium tracking-[-0.01em] break-words text-ink-900 dark:text-white">
            No hay fichas que coincidan con «{consulta.trim()}».
          </p>
          <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-ink-600 dark:text-ink-400">
            El buscador revisa el título y el resumen de cada ficha. Prueba con otra palabra o vuelve
            al listado completo.
          </p>
          <button
            type="button"
            onClick={limpiar}
            className="mt-5 inline-flex min-h-10 items-center gap-1.5 text-[13px] font-medium text-ink-900 transition-colors hover:text-ink-600 dark:text-white dark:hover:text-ink-300"
          >
            <span className="border-b border-ink-900 pb-0.5 dark:border-white">
              Limpiar búsqueda
            </span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </div>
  );
}
