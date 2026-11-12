/**
 * Índice de una ficha de /aprende.
 *
 * Solo presentación: recibe los encabezados que la ficha ya renderiza (id y
 * etiqueta) y arma el rail. Va sticky en escritorio, debajo del header; en
 * móvil se oculta, porque cada ficha son tres o cuatro párrafos y el índice
 * empujaría el texto fuera de la primera pantalla.
 */
export type SeccionFicha = {
  id: string;
  etiqueta: string;
};

export function IndiceFicha({
  secciones,
}: {
  secciones: readonly SeccionFicha[];
}) {
  return (
    <nav
      aria-label="Contenido de la ficha"
      className="hidden lg:sticky lg:top-24 lg:block lg:self-start"
    >
      <p className="label-line">Contenido de la ficha</p>
      <ol className="mt-4 border-t border-ink-300 dark:border-white/12">
        {secciones.map((seccion, i) => (
          <li
            key={seccion.id}
            className="border-b border-ink-300 dark:border-white/12"
          >
            <a
              href={`#${seccion.id}`}
              className="flex min-h-11 items-center gap-3 border-l border-transparent py-2 pl-3 pr-1 text-[13px] leading-snug text-ink-600 transition-colors hover:border-ink-900 hover:text-ink-900 dark:text-ink-400 dark:hover:border-white dark:hover:text-white"
            >
              <span
                aria-hidden
                className="num w-4 shrink-0 text-[11px] text-ink-400 dark:text-ink-500"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">{seccion.etiqueta}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
