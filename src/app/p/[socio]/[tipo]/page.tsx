import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { LegalNotice } from "@/components/legal/legal-notice";
import { absoluteUrl } from "@/lib/site";
import { getPortfolios } from "@/lib/queries";
import { getBeatTheMarketRanking } from "@/lib/performance-queries";
import {
  benchmarkLabelForSymbol,
  rankSources,
  type RankingSourceInput,
} from "@/lib/ranking";
import { formatPercent } from "@/lib/utils";
import {
  filterAllowedPortfolios,
  getPartnerBySlug,
  isPartnerWidgetTipo,
  PARTNER_WIDGET_META,
  type Partner,
  type PartnerWidgetTipo,
} from "@/lib/partners";

/**
 * Marca blanca para socios (F55): /p/[socio]/[tipo].
 *
 * El widget es el mismo de F52 (mismo catálogo, mismos datos públicos),
 * pero con la marca del socio: su logo, su nombre y un filete de su color.
 * El socio no puede cambiar el contenido: solo qué portafolios públicos
 * se ven, y esos salen de la lista `portafolios` del socio.
 *
 * Reglas:
 *  - "Datos de fraccion.si" siempre visible, más el aviso legal (Fintec).
 *  - El acento es decorativo y va en un filete, no en cifras: verde y rojo
 *    quedan reservados para el rendimiento.
 *  - La página del socio es pública y sin sesión. En fraccion.si, las
 *    posiciones reconstruidas de funcionarios de EE.UU. son para
 *    suscriptores; los informes oficiales siguen públicos en los sitios
 *    del gobierno (5 U.S.C. § 13107).
 *  - Sin datos personales de InfoProbidad ni recomendaciones (Leyes
 *    19.628, 21.719 y Fintec 21.521).
 */
export const instant = false;

interface PartnerPageProps {
  params: Promise<{ socio: string; tipo: string }>;
}

/** Qué muestra cada widget, en una línea, sin prometer posiciones. */
const WIDGET_INTRO: Record<PartnerWidgetTipo, string> = {
  portafolios:
    "Los portafolios que este socio publica, con su exceso de retorno contra el benchmark de cada país.",
  ranking:
    "Los portafolios de este socio, ordenados por exceso de retorno contra el benchmark de su país. Incluye los que pierden.",
};

export async function generateMetadata({
  params,
}: PartnerPageProps): Promise<Metadata> {
  const { socio, tipo } = await params;
  if (!isPartnerWidgetTipo(tipo)) {
    return { title: "fraccion.si", robots: { index: false } };
  }
  const partner = await getPartnerBySlug(socio);
  return {
    title: partner
      ? `${partner.nombre} — Datos de fraccion.si`
      : "Datos de fraccion.si",
    description: partner
      ? `Datos públicos de fraccion.si para ${partner.nombre}. Información informativa, no es recomendación de inversión.`
      : "Datos públicos de fraccion.si.",
    robots: { index: false },
  };
}

export default async function PartnerWidgetPage({
  params,
}: PartnerPageProps) {
  await connection();
  const { socio, tipo } = await params;
  if (!isPartnerWidgetTipo(tipo)) notFound();

  const partner = await getPartnerBySlug(socio);
  if (!partner) notFound();

  const title = PARTNER_WIDGET_META[tipo].title;

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink-900">
      <header
        className="border-b border-line"
        style={{ borderTop: `2px solid ${partner.accent}` }}
      >
        <div className="container-page flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {partner.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={partner.logo_url}
                alt=""
                height={28}
                className="h-7 w-auto shrink-0 object-contain"
                loading="lazy"
              />
            ) : null}
            <div className="min-w-0">
              <p className="text-[13px] leading-tight text-ink-500">
                {partner.nombre}
              </p>
              <h1 className="mt-1 text-[20px] font-medium leading-tight tracking-[-0.02em] text-ink-900">
                {title}
              </h1>
            </div>
          </div>
          <p className="shrink-0 text-[13px] text-ink-500">Datos de fraccion.si</p>
        </div>
      </header>

      <main id="main" className="container-page flex-1 py-8 md:py-10">
        <p className="max-w-[44rem] text-[15px] leading-relaxed text-ink-500">
          {WIDGET_INTRO[tipo]}
        </p>
        <div className="mt-6">
          {tipo === "portafolios" ? (
            <PortfoliosPanel partner={partner} />
          ) : (
            <RankingPanel partner={partner} />
          )}
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="container-page py-6">
          <p className="max-w-[54rem] text-[12px] leading-relaxed text-ink-500">
            Datos públicos de fraccion.si. Las posiciones reconstruidas de
            funcionarios de EE.UU. son para suscriptores; los informes oficiales
            siguen públicos y gratis en los sitios de la Cámara, el Senado y la
            OGE.
          </p>
          <p className="mt-2 max-w-[54rem] text-[12px] leading-relaxed text-ink-500">
            La atribución{" "}
            <span className="text-ink-900">“Datos de fraccion.si”</span> es
            obligatoria: no se puede quitar ni modificar el widget.
          </p>
          <div className="mt-4">
            <LegalNotice kind="fintec" />
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Estado vacío honesto, sin caja punteada. */
function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-y border-line py-4 text-[15px] leading-relaxed text-ink-500">
      {children}
    </p>
  );
}

/** Lista de portafolios que el socio puede mostrar. */
async function PortfoliosPanel({ partner }: { partner: Partner }) {
  const [portfolios, metrics] = await Promise.all([
    getPortfolios(),
    getBeatTheMarketRanking(200),
  ]);

  const allowed = filterAllowedPortfolios(partner, portfolios);
  const metricsBySlug = new Map(metrics.map((row) => [row.slug, row]));

  if (allowed.length === 0) {
    return (
      <EmptyNote>Este socio todavía no tiene portafolios publicados.</EmptyNote>
    );
  }

  const withFigure = allowed.filter((portfolio) => metricsBySlug.has(portfolio.slug));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 border-b border-ink-900 pb-1.5 text-[13px] text-ink-500">
        <span>Portafolio</span>
        <span>Exceso vs benchmark</span>
      </div>
      <ul className="border-b border-line">
        {allowed.map((portfolio) => {
          const metric = metricsBySlug.get(portfolio.slug);
          const excess = metric?.excess_return_pct ?? null;
          return (
            <li
              key={portfolio.slug}
              className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0"
            >
              <span className="min-w-0 truncate text-[15px] text-ink-900">
                <span className="font-medium">{portfolio.name}</span>
                <span className="text-ink-500"> · {portfolio.country}</span>
              </span>
              {excess === null ? (
                <span className="shrink-0 text-[13px] text-ink-500">Sin datos</span>
              ) : (
                <span
                  className={
                    "num shrink-0 text-[15px] " +
                    (excess > 0
                      ? "text-positive"
                      : excess < 0
                        ? "text-negative"
                        : "text-ink-900")
                  }
                >
                  {formatPercent(excess, 1).replace("%", "")} pp
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {withFigure.length === 0 ? (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
          Todavía no hay métricas publicadas para estos portafolios. Cuando las
          haya, aparecerán con su fecha de corte y su benchmark.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Ranking honesto del socio: los mismos datos y el mismo método que el
 * widget de F52, pero limitado a los portafolios que el socio puede
 * mostrar. Los que pierden también aparecen.
 */
async function RankingPanel({ partner }: { partner: Partner }) {
  const [portfolios, metrics] = await Promise.all([
    getPortfolios(),
    getBeatTheMarketRanking(200),
  ]);

  const allowedSlugs = new Set(
    filterAllowedPortfolios(partner, portfolios).map((p) => p.slug),
  );
  const metricsByPortfolio = new Map(metrics.map((row) => [row.portfolio_id, row]));

  const sources: RankingSourceInput[] = portfolios
    .filter((portfolio) => allowedSlugs.has(portfolio.slug))
    .map((portfolio) => {
      const metric = metricsByPortfolio.get(portfolio.id);
      return {
        id: `portfolio-${portfolio.id}`,
        name: portfolio.name,
        kind: "portfolio",
        country: portfolio.country === "CL" ? "CL" : "US",
        returnPct: metric?.return_pct ?? null,
        benchmarkReturnPct: metric?.benchmark_return_pct ?? null,
        // Sin métrica no se inventa el benchmark: `rankSources` lo deduce del país.
        benchmarkLabel: metric?.benchmark_symbol
          ? benchmarkLabelForSymbol(metric.benchmark_symbol)
          : undefined,
        dataPoints: metric?.data_points ?? null,
        asOf: metric?.as_of ?? "",
        href: `/portfolio/${portfolio.slug}`,
      };
    });

  const rows = rankSources(sources);

  if (rows.length === 0) {
    return (
      <EmptyNote>Este socio todavía no tiene portafolios publicados.</EmptyNote>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 border-b border-ink-900 pb-1.5 text-[13px] text-ink-500">
        <span>Portafolio</span>
        <span>Exceso vs benchmark</span>
      </div>
      <ul className="border-b border-line">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0"
          >
            <span className="flex min-w-0 flex-1 items-baseline gap-3">
              <span className="num w-5 shrink-0 text-[13px] text-ink-500">
                {row.rank === null ? "—" : String(row.rank).padStart(2, "0")}
              </span>
              <span className="min-w-0 truncate text-[15px] text-ink-900">
                {row.name}
                <span className="text-[13px] text-ink-500"> · {row.benchmarkLabel}</span>
              </span>
            </span>
            {row.excessReturnPct === null ? (
              <span className="shrink-0 text-[13px] text-ink-500">Sin datos</span>
            ) : (
              <span
                className={
                  "num shrink-0 text-[15px] " +
                  (row.excessReturnPct > 0
                    ? "text-positive"
                    : row.excessReturnPct < 0
                      ? "text-negative"
                      : "text-ink-900")
                }
              >
                {formatPercent(row.excessReturnPct, 1).replace("%", "")} pp
              </span>
            )}
          </li>
        ))}
      </ul>
      {rows.every((row) => row.excessReturnPct === null) ? (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
          Todavía no hay métricas publicadas para estos portafolios. Cuando las
          haya, aparecerán con su fecha de corte y su benchmark.
        </p>
      ) : null}
      <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
        Incluye los portafolios que pierden. El método completo está en{" "}
        <a
          href={absoluteUrl("/metodologia")}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-900 underline underline-offset-4"
        >
          la metodología
        </a>
        .
      </p>
    </div>
  );
}
