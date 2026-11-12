/**
 * Índice de letras del Glosario.
 *
 * Es un server component a propósito: son anclas puras (`#a`, `#b`…), sin
 * estado, sin handlers y sin JavaScript de cliente. El desplazamiento suave y
 * el `prefers-reduced-motion` ya los resuelve globals.css.
 *
 * La barra se pega bajo el header (64px) desde `sm`; en móvil se queda en el
 * flujo para que un índice de dos filas no tape el título al saltar a una
 * letra. Su alto es 45px (36px de celda + 8px de padding + 1px de filete), así
 * que el `scroll-mt-28` (112px) de cada grupo deja 3px de aire bajo la barra.
 */
type GlosarioLetrasProps = {
  /** Letras iniciales existentes, ya ordenadas y sin repetir. */
  letras: readonly string[];
};

export function GlosarioLetras({ letras }: GlosarioLetrasProps) {
  return (
    <nav
      aria-label="Letras del glosario"
      className="border-b border-ink-300 bg-white py-1 dark:border-white/12 dark:bg-ink-950 sm:sticky sm:top-16 sm:z-40"
    >
      <ul className="flex flex-wrap items-center gap-1">
        {letras.map((letra) => (
          <li key={letra}>
            <a
              href={`#${letra.toLowerCase()}`}
              aria-label={`Ir a la letra ${letra}`}
              className="inline-flex h-9 min-w-8 items-center justify-center border border-ink-300 px-2 text-[12px] font-medium text-ink-600 transition-colors hover:border-ink-900 hover:bg-ink-900 hover:text-white dark:border-white/12 dark:text-ink-300 dark:hover:border-white dark:hover:bg-white dark:hover:text-ink-950"
            >
              {letra}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
