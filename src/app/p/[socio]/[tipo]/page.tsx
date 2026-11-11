import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { LegalNotice } from "@/components/legal/legal-notice";
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
} from "@/lib/partners";

/**
 * Marca blanca para socios (F55): /p/[socio]/[tipo].
 *
 * El widget es el mismo de F52 (mismo catálogo, mismos datos públicos),
 * pero con la marca del socio: su logo, su nombre y su color de acento.
 * El socio no puede cambiar el contenido: solo qué portafolios públicos
 * se ven, y esos salen de la lista `portfolios` del socio.
 *
 * Reglas:
 *  - "Datos de reclu.cl" siempre visible, más el aviso legal (Fintec).
 *  - El acento es decorativo: verde y rojo quedan reservados para las
 *    cifras de rendimiento, y el contraste se valida antes de usarlo.
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
}: PartnerPageProps,
) {
  await connection();
  const { socio, tipo } = await params;
  if (!isPartnerWidgetTipo(tipo)) notFound();

  const partner = await getPartnerBySlug(socio);
  if (!partner) notFound();

  const title = PARTNER_WIDGET_META[tipo].title;

  return (
    <div className="flex min-h-screen flex-col bg-white text-ink-900">
      <header className="border-b border-ink-200">
        <div className="container-page flex items-center justify-between gap-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {partner.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={partner.logo_url}
                alt={partner.nombre}
                height={28}
                className="h-7 w-auto shrink-0 object-contain"
                loading="lazy"
              />
            ) : null}
            <div className="min-w-0">
              <p
                className="truncate text-[11px] leading-none"
                style={{ color: partner.accent }}
              >
                {partner.nombre}
              </p>
              <h1 className="mt-1.5 truncate text-[16px] font-medium leading-tight tracking-[-0.02em]">
                {title}
              </h1>
            </div>
          </div>
          <p className="shrink-0 text-[11px] text-ink-500">Datos de fraccion.si</p>
        </div>
      </header>

      <main id="main" className="container-page flex-1 py-8 md:py-10">
        {tipo === "portafolios" ? (
          <PortfoliosPanel partner={partner} />
        ) : (
          <RankingPanel partner={partner} />
        )}
      </main>

      <footer className="border-t border-ink-200">
        <div className="container-page py-6">
          <p className="text-[12px] leading-relaxed text-ink-500">
            Datos públicos de fraccion.si. La atribución{" "}
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
      <p className="border border-ink-200 px-4 py-6 text-center text-[13px] text-ink-500">
        Este socio todavía no tiene portafolios publicados.
      </p>
    );
  }

  return (
    <ul>
      {allowed.map((portfolio) => {
        const metric = metricsBySlug.get(portfolio.slug);
        const excess = metric?.excess_return_pct ?? null;
        return (
          <li
            key={portfolio.slug}
            className="flex items-baseline gap-3 border-b border-ink-200 py-2.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1 truncate text-[14px] text-ink-900">
              <span className="font-medium">{portfolio.name}</span>
              <span className="text-ink-500"> · {portfolio.country}</span>
            </span>
            <span
              className={
                "num shrink-0 text-[13px] " +
                (excess !== null && excess > 0
                  ? "text-positive"
                  : excess !== null && excess < 0
                    ? "text-negative"
                    : "text-ink-900")
              }
            >
              {excess === null
                ? "—"
                : `${formatPercent(excess, 1).replace("%", "")} pp`}
            </span>
          </li>
        );
      })}
    </ul>
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
        benchmarkLabel: benchmarkLabelForSymbol(
          metric?.benchmark_symbol ?? null,
        ),
        dataPoints: metric?.data_points ?? null,
        asOf: metric?.as_of ?? "",
        href: `/portfolio/${portfolio.slug}`,
      };
    });

  const rows = rankSources(sources);

  if (rows.length === 0) {
    return (
      <p className="border border-ink-200 px-4 py-6 text-center text-[13px] text-ink-500">
        Este socio todavía no tiene portafolios publicados.
      </p>
    );
  }

  return (
    <div>
      <p className="text-[11px] text-ink-500">
        Exceso de retorno en pp contra el benchmark de cada país
      </p>
      <ul className="mt-1">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-baseline gap-3 border-b border-ink-200 py-2 last:border-b-0"
          >
            <span className="num w-5 shrink-0 text-[11px] text-ink-500">
              {row.rank === null ? "—" : String(row.rank).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-ink-900">
              {row.name}
            </span>
            <span
              className={
                "num shrink-0 text-[13px] " +
                (row.excessReturnPct !== null && row.excessReturnPct > 0
                  ? "text-positive"
                  : row.excessReturnPct !== null && row.excessReturnPct < 0
                    ? "text-negative"
                    : "text-ink-900")
              }
            >
              {row.excessReturnPct === null
                ? "—"
                : `${formatPercent(row.excessReturnPct, 1).replace("%", "")} pp`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] leading-snug text-ink-500">
        Incluye los portafolios que pierden. Metodología en fraccion.si/metodologia.
      </p>
    </div>
  );
}
