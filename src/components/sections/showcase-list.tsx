import { PortfolioRow } from "@/components/portfolio-row";
import type { ShowcasePortfolio } from "./portfolio-data";

/**
 * Lista de filas de la home. El subrayado del nombre es de 1px, con offset,
 * y aparece por color — sin lift ni sombra. Las cifras heredan tabular-nums.
 */
const frame =
  "[&_a]:gap-x-12 [&_a]:py-8 md:[&_a]:py-10 " +
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
