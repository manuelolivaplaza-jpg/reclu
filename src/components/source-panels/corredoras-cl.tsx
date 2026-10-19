import { LegalNotice } from "@/components/legal/legal-notice";
import { getHoldings, getPortfolioBySlug } from "@/lib/queries";
import type { Holding } from "@/lib/types";
import type { SourcePanelProps } from "@/components/source-panels";

type Cartera = {
  slug: string;
  corredora: string;
  fecha: string;
  pdf: string;
  pesos: Record<string, number>;
};

type Parcial = {
  corredora: string;
  fuente: string;
  pesos: Record<string, number>;
  nota: string;
};

/**
 * Corte de octubre 2026 (scrapers/data/v2/F23/carteras_oct_2026.json).
 * Se usa como respaldo cuando Supabase no tiene la migracion 024 aplicada,
 * y como semilla de las carteras parciales (que no estan en la base).
 */
const CARTERAS: Cartera[] = [
  {
    slug: "bice-cartera-recomendada",
    corredora: "BICE Inversiones",
    fecha: "2026-10-05",
    pdf: "https://mercadosenlinea.biceinversiones.cl/reportes/cartera-inversiones-bice.pdf",
    pesos: {
      FALABELLA: 20,
      LTM: 20,
      "SQM-B": 15,
      CHILE: 15,
      BSANTANDER: 12.5,
      BCI: 10,
      ENELCHILE: 7.5,
    },
  },
  {
    slug: "mbi-cartera-recomendada",
    corredora: "MBI Corredores de Bolsa",
    fecha: "2026-10-05",
    pdf: "https://corredores.mbi.cl/static/uploads/docs/20261005185815_Cartera_Octubre.pdf",
    pesos: {
      COPEC: 20,
      ITAUCL: 20,
      LTM: 20,
      "SQM-B": 20,
      CENCOMALLS: 20,
    },
  },
];

const PARCIALES: Parcial[] = [
  {
    corredora: "Itaú Corredores de Bolsa",
    fuente:
      "https://www.alfasybetas.cl/2026/10/07/chile-las-corredoras-reordenan-sus-carteras-entre-tasas-altas-y-datos-debiles/",
    pesos: { BSANTANDER: 25, LTM: 20, "SQM-B": 16 },
    nota: "7 acciones; sacó BCI. Falta el PDF original.",
  },
  {
    corredora: "Credicorp Capital (CL10)",
    fuente:
      "https://www.alfasybetas.cl/2026/10/07/chile-las-corredoras-reordenan-sus-carteras-entre-tasas-altas-y-datos-debiles/",
    pesos: { LTM: 15, FALABELLA: 14 },
    nota: "Entran COLBUN y SALFACORP; salen PARAUCO y ANDINA-B. Falta el PDF original.",
  },
];

const NOMBRES: Record<string, string> = {
  FALABELLA: "Falabella",
  LTM: "LATAM Airlines",
  "SQM-B": "SQM-B",
  CHILE: "Banco de Chile",
  BSANTANDER: "Banco Santander",
  BCI: "BCI",
  ENELCHILE: "Enel Chile",
  COPEC: "Copec",
  ITAUCL: "Itaú Corpbanca",
  CENCOMALLS: "Cencosud Shopping",
  COLBUN: "Colbún",
  SALFACORP: "Salfacorp",
  PARAUCO: "Parque Arauco",
  "ANDINA-B": "Andina-B",
};

const CONSENSO = (() => {
  const totales: Record<string, number> = {};
  for (const cartera of CARTERAS) {
    for (const [symbol, weight] of Object.entries(cartera.pesos)) {
      totales[symbol] = (totales[symbol] ?? 0) + weight;
    }
  }
  return Object.fromEntries(
    Object.entries(totales).map(([symbol, total]) => [
      symbol,
      Math.round((total / CARTERAS.length) * 100) / 100,
    ]),
  );
})();

function ultimas(holdings: Holding[]): Holding[] {
  const fechas = holdings
    .map((holding) => holding.as_of)
    .filter((fecha): fecha is string => Boolean(fecha))
    .sort();
  const corte = fechas.at(-1);
  if (!corte) return holdings;
  return holdings.filter((holding) => holding.as_of === corte);
}

function pesosDe(holdings: Holding[], respaldo: Record<string, number>) {
  if (holdings.length === 0) return respaldo;
  return Object.fromEntries(
    holdings.map((holding) => [holding.symbol, Number(holding.weight)]),
  );
}

function fechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  if (!anio || !mes || !dia) return fecha;
  return `${dia}-${mes}-${anio}`;
}

function porcentaje(peso: number | undefined): string {
  if (peso === undefined) return "—";
  return `${peso.toFixed(2).replace(".", ",")}%`;
}

/**
 * Tabla corredora × acción. Los pesos son los publicados por cada corredora;
 * el consenso es el promedio simple de las carteras completas (BICE y MBI).
 * Las carteras parciales se listan aparte y no entran al promedio.
 */
export async function CorredorasClPanel({ slug }: SourcePanelProps) {
  const carteras = await Promise.all(
    CARTERAS.map(async (cartera) => {
      const portfolio = await getPortfolioBySlug(cartera.slug);
      if (!portfolio) return cartera;
      const holdings = ultimas(await getHoldings(portfolio.id));
      return {
        ...cartera,
        fecha: holdings[0]?.as_of ?? cartera.fecha,
        pesos: pesosDe(holdings, cartera.pesos),
      };
    }),
  );

  const simbolos = Array.from(
    new Set(carteras.flatMap((cartera) => Object.keys(cartera.pesos))),
  ).sort((a, b) => (CONSENSO[b] ?? 0) - (CONSENSO[a] ?? 0) || a.localeCompare(b));

  return (
    <section
      id={`panel-${slug}`}
      className="border-t border-ink-200 pt-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-medium text-ink-900">
          Consenso de corredoras
        </h2>
        <p className="text-[12px] text-ink-500">
          Carteras completas al corte. Pesos publicados, sin renormalizar.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-ink-900 text-left">
              <th className="py-2 pr-4 font-normal text-ink-500">Acción</th>
              {carteras.map((cartera) => (
                <th
                  key={cartera.slug}
                  className="px-3 py-2 text-right font-normal text-ink-900"
                >
                  <span className="block">{cartera.corredora}</span>
                  <span className="mt-0.5 block text-[11px] font-normal text-ink-500">
                    {fechaCorta(cartera.fecha)} ·{" "}
                    <a
                      href={cartera.pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4"
                    >
                      PDF
                    </a>
                  </span>
                </th>
              ))}
              <th className="px-3 py-2 text-right font-normal text-ink-900">
                <span className="block">Consenso</span>
                <span className="mt-0.5 block text-[11px] font-normal text-ink-500">
                  promedio BICE + MBI
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {simbolos.map((symbol) => (
              <tr key={symbol} className="border-b border-ink-100">
                <th scope="row" className="py-2 pr-4 text-left font-normal">
                  <span className="block text-ink-900">{symbol}</span>
                  <span className="block text-[11px] text-ink-500">
                    {NOMBRES[symbol] ?? symbol}
                  </span>
                </th>
                {carteras.map((cartera) => (
                  <td
                    key={cartera.slug}
                    className="px-3 py-2 text-right tabular-nums text-ink-900"
                  >
                    {porcentaje(cartera.pesos[symbol])}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-medium tabular-nums text-ink-900">
                  {porcentaje(CONSENSO[symbol])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 border-t border-ink-200 pt-4">
        <h3 className="text-[13px] font-medium text-ink-900">
          Referencia: carteras parciales (no entran al consenso)
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
          De estas corredoras solo se conocen algunos pesos por prensa. No se
          promedian hasta tener el PDF original con la cartera completa.
        </p>
        <ul className="mt-3 space-y-3">
          {PARCIALES.map((parcial) => (
            <li
              key={parcial.corredora}
              className="border-t border-ink-100 pt-3 text-[12px] leading-relaxed"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-ink-900">{parcial.corredora}</span>
                <a
                  href={parcial.fuente}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-500 underline underline-offset-4"
                >
                  Fuente
                </a>
              </div>
              <p className="mt-1 tabular-nums text-ink-900">
                {Object.entries(parcial.pesos)
                  .map(([symbol, peso]) => `${symbol} ${porcentaje(peso)}`)
                  .join(" · ")}
              </p>
              <p className="mt-1 text-ink-500">{parcial.nota}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <LegalNotice kind="fintec" />
      </div>
    </section>
  );
}
