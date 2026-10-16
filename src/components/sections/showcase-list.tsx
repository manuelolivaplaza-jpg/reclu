import { PortfolioRow } from "@/components/portfolio-row";
import type { ShowcasePortfolio } from "./portfolio-data";

/**
 * Lista de filas de la home. El subrayado del nombre es de 1px, con offset,
 * y aparece por color — sin lift ni sombra. Las cifras heredan tabular-nums.
 * Hover: una línea activa de 1px negra se expande de izquierda a derecha
 * sobre cada fila (scale-x, origin-left, 500ms, la curva del sistema).
 */
const frame =
  "[&_a]:relative [&_a]:gap-x-12 [&_a]:py-8 md:[&_a]:py-10 " +
  "[&_a]:before:absolute [&_a]:before:inset-x-0 [&_a]:before:top-0 [&_a]:before:h-px [&_a]:before:bg-ink-900 " +
  "[&_a]:before:origin-left [&_a]:before:scale-x-0 [&_a]:before:transition-transform " +
  "[&_a]:before:duration-500 [&_a]:before:ease-[cubic-bezier(0.16,1,0.3,1)] " +
  "[&_a:hover]:before:scale-x-100 [&_a:focus-visible]:before:scale-x-100 " +
  "[&_h3]:underline [&_h3]:decoration-transparent [&_h3]:underline-offset-[0.32em] " +
  "[&_h3]:[text-decoration-thickness:1px] [&_h3]:transition-[text-decoration-color] [&_h3]:duration-200 " +
  "[&_a:hover_h3]:decoration-ink-900 " +
  "[&_.num]:text-[clamp(2.25rem,4.6vw,3.6rem)] [&_.num]:tracking-[-0.045em]";

export function ShowcaseList({ portfolios }: { portfolios: ShowcasePortfolio[] }) {
  return (
    <div className={frame}>
      {portfolios.map((portfolio, i) => (
        <PortfolioRow
          key={portfolio.slug}
          portfolio={portfolio}
          isLast={i === portfolios.length - 1}
        />
      ))}
    </div>
  );
}
