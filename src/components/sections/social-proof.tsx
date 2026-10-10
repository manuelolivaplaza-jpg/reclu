import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

/** Social proof: stats bar + press-style source logos. */
export function SocialProof() {
  const stats = [
    { value: "10+", label: "Portafolios trackeados" },
    { value: "5", label: "Corredoras chilenas" },
    { value: "Diarias", label: "Alertas promedio" },
    { value: "100%", label: "Datos públicos" },
  ];

  return (
    <section className="border-b border-ink-200/60 py-14">
      <div className="container-page">
        <p className="text-center text-sm font-medium text-ink-500">
          Datos de fuentes públicas confiables
        </p>

        {/* Source chips — text-based logos, no external images */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {[
            "Capitol Trades",
            "Renta 4",
            "LarrainVial",
            "BTG Pactual",
            "InfoProbidad",
            "SEC 13F",
          ].map((source) => (
            <span
              key={source}
              className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold tracking-wide text-ink-500 shadow-subtle"
            >
              {source}
            </span>
          ))}
        </div>

        {/* Stats */}
        <div className="mt-12 grid grid-cols-2 gap-6 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-semibold tracking-tight text-ink-900 tabular-nums sm:text-4xl">
                {stat.value}
              </div>
              <div className="mt-1.5 text-sm text-ink-600">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Portfolios teaser — shows categories with links into /explore. */
const CATEGORIES_TEASER = [
  {
    label: "Políticos EE.UU.",
    description: "Pelosi, Trump y más",
    href: "/explore?categoria=political_us",
  },
  {
    label: "Corredoras Chile",
    description: "Renta 4, LarrainVial, BTG",
    href: "/explore?categoria=broker_cl",
  },
  {
    label: "Temáticos / IA",
    description: "AI World War, Inverse Cramer",
    href: "/explore?categoria=thematic",
  },
  {
    label: "Hedge Funds",
    description: "Filings 13F institucionales",
    href: "/explore?categoria=hedge_fund",
  },
];

export function PortfoliosTeaser() {
  return (
    <section id="portafolios" className="border-b border-ink-200/60 py-24">
      <div className="container-page">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">
              Portafolios
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Explora por categoría
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-600">
              Desde trades de congresistas hasta carteras moderadas de corredoras
              chilenas.
            </p>
          </div>
          <Link
            href="/explore"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Ver todos los portafolios
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES_TEASER.map((cat) => (
            <Link
              key={cat.label}
              href={cat.href}
              className="group rounded-card border border-ink-200 bg-white p-6 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised"
            >
              <Badge variant="outline" className="mb-4">
                Categoría
              </Badge>
              <h3 className="text-base font-semibold text-ink-900 group-hover:text-brand-700">
                {cat.label}
              </h3>
              <p className="mt-1.5 text-sm text-ink-600">{cat.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600">
                Explorar
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
