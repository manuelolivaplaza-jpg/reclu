import { withSeo } from "@/lib/seo";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ButtonLink } from "@/components/ui/button";
import {
  LEGAL_NOTICES,
  LEGAL_PAGE_LINKS,
  US_DISCLOSURE_SOURCES,
} from "@/lib/legal";
import {
  API_BASE_PATH,
  API_DATASETS,
  EXCLUDED_API_DATASETS,
} from "@/lib/api-datasets";

export const metadata: Metadata = withSeo("/api-docs", {
  title: "API de datos",
  description:
    "API pública de datos chilenos de fraccion.si: AFP, corredoras, InfoProbidad, dividendos, hechos esenciales e insiders. JSON paginado con licencia y atribución.",
});

/** Secciones con ancla. El índice solo aparece si hay 4 o más. */
const SECTIONS = [
  { id: "autenticacion", label: "Autenticación" },
  { id: "datasets", label: "Datasets" },
  { id: "paginacion", label: "Paginación" },
  { id: "errores", label: "Errores" },
  { id: "fuera-de-la-api", label: "Fuera de la API" },
  { id: "licencia", label: "Licencia y datos personales" },
] as const;

const EXAMPLE_RESPONSE = `{
  "dataset": "dividendos",
  "license": "Uso informativo; términos de la CMF pendientes de revisión",
  "license_url": "https://www.cmfchile.cl/…",
  "attribution": "Fuente: CMF (Comisión para el Mercado Financiero).",
  "source_url": "https://www.cmfchile.cl/…",
  "generated_at": "2026-10-20T12:00:00.000Z",
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total": 201,
    "total_pages": 5,
    "has_more": true
  },
  "data": [
    {
      "nemo": "SANTAMARIA",
      "fecha_pago": "2026-10-15",
      "numero_dividendo": "123",
      "serie": "",
      "tipo": "definitivo",
      "moneda": "CLP",
      "monto": 1.23
    }
  ]
}`;

const STATUS_ROWS = [
  {
    code: "401",
    meaning: "Clave ausente, inválida o revocada. El mensaje es siempre genérico.",
  },
  {
    code: "404",
    meaning: "Dataset fuera de la lista blanca o inexistente.",
  },
  {
    code: "429",
    meaning:
      "Límite diario alcanzado. Mira X-RateLimit-Reset y vuelve al día siguiente (UTC).",
  },
  {
    code: "503",
    meaning: "API apagada o base de datos no configurada. Reintenta más tarde.",
  },
] as const;

/** Código en línea: fondo tenue del esquema, legible en claro y en oscuro. */
function Code({ children }: { children: ReactNode }) {
  return (
    <code className="break-words bg-ink-100 px-1 py-0.5 font-mono text-[0.875em] text-ink-900 dark:bg-white/10 dark:text-white">
      {children}
    </code>
  );
}

/** Bloque de código con etiqueta, scroll horizontal contenido y foco visible. */
function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <figure className="mt-5 border border-ink-300 dark:border-white/12">
      <figcaption className="label-line border-b border-ink-300 px-4 py-2 dark:border-white/12">
        {label}
      </figcaption>
      <pre
        tabIndex={0}
        role="region"
        aria-label={`${label}: código con desplazamiento horizontal`}
        className="overflow-x-auto bg-ink-50 p-4 font-mono text-[12.5px] leading-[1.7] text-ink-900 sm:text-[13px] dark:bg-white/[0.04] dark:text-ink-100"
      >
        <code>{code}</code>
      </pre>
    </figure>
  );
}

export default function ApiDocsPage() {
  const datasets = Object.values(API_DATASETS);
  const excluded = Object.entries(EXCLUDED_API_DATASETS);

  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-white dark:bg-ink-950">
        <div className="container-page pb-24 pt-10 md:pt-14">
          <header className="border-b border-ink-300 pb-10 dark:border-white/12 md:pb-12">
            <p className="label-line">API v1</p>
            <h1 className="type-section mt-4 text-ink-900 dark:text-white">
              API.
            </h1>
            <p className="type-body mt-6 max-w-2xl">
              Datos públicos chilenos en JSON, con licencia y atribución en cada
              respuesta. Sin ejecutar órdenes, sin enrutarlas y sin
              recomendaciones personalizadas.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <ButtonLink href="/settings/api" size="lg">
                Crear una clave
              </ButtonLink>
              <Link
                href="/disclaimer"
                className="inline-flex items-center border-b border-ink-900 pb-0.5 text-[14px] font-medium text-ink-900 transition-colors hover:text-ink-600 dark:border-white dark:text-white dark:hover:text-ink-300"
              >
                Leer el disclaimer
              </Link>
            </div>
          </header>

          <nav aria-label="En esta página" className="mt-10">
            <p className="label-line">En esta página</p>
            <ol className="mt-3 grid gap-px border border-ink-300 bg-ink-300 sm:grid-cols-2 lg:grid-cols-3 dark:border-white/12 dark:bg-white/12">
              {SECTIONS.map((section, index) => (
                <li key={section.id} className="bg-white dark:bg-ink-950">
                  <a
                    href={`#${section.id}`}
                    className="flex items-baseline gap-3 px-4 py-3.5 transition-colors hover:bg-ink-50 dark:hover:bg-white/[0.06]"
                  >
                    <span
                      aria-hidden
                      className="num text-[12px] text-ink-400 dark:text-ink-500"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[14px] font-medium text-ink-900 dark:text-white">
                      {section.label}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <section
            id="autenticacion"
            className="mt-14 scroll-mt-28 border-t border-ink-300 pt-8 dark:border-white/12"
          >
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900 dark:text-white">
              Autenticación
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-600 dark:text-ink-400">
              Crea una clave en{" "}
              <Link
                href="/settings/api"
                className="text-ink-900 underline underline-offset-4 dark:text-white"
              >
                Ajustes → API
              </Link>
              . Viaja en la cabecera{" "}
              <Code>Authorization: Bearer rcl_…</Code>. La clave es personal: no
              la compartas ni la subas a un repositorio.
            </p>

            <CodeBlock
              label="Solicitud"
              code={`curl -H "Authorization: Bearer rcl_…" \\
  "https://fraccion.si${API_BASE_PATH}/dividendos?page=1&per_page=50"`}
            />

            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-600 dark:text-ink-400">
              Todo el acceso está apagado mientras{" "}
              <Code>API_PUBLIC_ENABLED</Code> no sea exactamente{" "}
              <Code>true</Code>.
            </p>

            <h3 className="mt-8 text-[16px] font-medium tracking-[-0.02em] text-ink-900 dark:text-white">
              Cuota diaria
            </h3>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-600 dark:text-ink-400">
              El límite diario depende del plan vigente del dueño de la clave:
              Gratis 100, Pro 1.000 y Elite 10.000 llamadas por día (UTC). Las
              respuestas con datos y los 429 incluyen las cabeceras{" "}
              <Code>X-RateLimit-*</Code>.
            </p>
          </section>

          <section
            id="datasets"
            className="mt-14 scroll-mt-28 border-t border-ink-300 pt-8 dark:border-white/12"
          >
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900 dark:text-white">
              Datasets
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-600 dark:text-ink-400">
              La lista es cerrada. Cada endpoint responde con{" "}
              <Code>license</Code>, <Code>attribution</Code>,{" "}
              <Code>source_url</Code> y paginación.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-500 dark:text-ink-400">
              Los enlaces con ↗ abren el sitio de la fuente en una pestaña
              nueva.
            </p>

            <div
              role="region"
              aria-label="Tabla de datasets: desplazable en horizontal"
              tabIndex={0}
              className="mt-6 overflow-x-auto overscroll-x-contain"
            >
              <table className="w-full min-w-[720px] border-collapse text-left">
                <caption className="sr-only">
                  Datasets de la API v1: qué entrega cada uno, su licencia y
                  atribución, y los filtros que acepta.
                </caption>
                <thead>
                  <tr className="border-y border-ink-300 dark:border-white/12">
                    <th
                      scope="col"
                      className="py-3 pr-6 text-[12px] font-medium tracking-[0.04em] text-ink-500 uppercase dark:text-ink-400"
                    >
                      Dataset
                    </th>
                    <th
                      scope="col"
                      className="py-3 pr-6 text-[12px] font-medium tracking-[0.04em] text-ink-500 uppercase dark:text-ink-400"
                    >
                      Qué entrega
                    </th>
                    <th
                      scope="col"
                      className="py-3 pr-6 text-[12px] font-medium tracking-[0.04em] text-ink-500 uppercase dark:text-ink-400"
                    >
                      Licencia y atribución
                    </th>
                    <th
                      scope="col"
                      className="py-3 text-[12px] font-medium tracking-[0.04em] text-ink-500 uppercase dark:text-ink-400"
                    >
                      Filtros
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {datasets.map((dataset) => (
                    <tr
                      key={dataset.slug}
                      className="border-b border-ink-300 align-top dark:border-white/12"
                    >
                      <th
                        scope="row"
                        className="py-4 pr-6 text-left align-top font-normal"
                      >
                        <Link
                          href={`${API_BASE_PATH}/${dataset.slug}`}
                          className="text-[15px] font-medium text-ink-900 underline-offset-4 hover:underline dark:text-white"
                        >
                          {dataset.label}
                        </Link>
                        <p className="mt-1 font-mono text-[12px] text-ink-500 dark:text-ink-400">
                          {API_BASE_PATH}/{dataset.slug}
                        </p>
                      </th>
                      <td className="max-w-sm py-4 pr-6 text-[13px] leading-relaxed text-ink-600 dark:text-ink-400">
                        {dataset.description}
                      </td>
                      <td className="max-w-xs py-4 pr-6 text-[13px] leading-relaxed text-ink-600 dark:text-ink-400">
                        <p className="text-ink-900 dark:text-white">
                          {dataset.license}
                        </p>
                        <p className="mt-1">{dataset.attribution}</p>
                        <a
                          href={dataset.licenseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-[12px] text-ink-900 underline underline-offset-4 dark:text-white"
                        >
                          Ver términos <span aria-hidden>↗</span>
                          <span className="sr-only">
                            {" "}
                            (abre fuera de fraccion.si)
                          </span>
                        </a>
                      </td>
                      <td className="py-4 font-mono text-[12px] leading-relaxed text-ink-500 dark:text-ink-400">
                        {dataset.filters.join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            id="paginacion"
            className="mt-14 scroll-mt-28 border-t border-ink-300 pt-8 dark:border-white/12"
          >
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900 dark:text-white">
              Paginación
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-600 dark:text-ink-400">
              Usa <Code>page</Code> (desde 1) y <Code>per_page</Code> (máximo
              100; por defecto 50). También se aceptan <Code>offset</Code> y{" "}
              <Code>limit</Code>.
            </p>

            <h3 className="mt-8 text-[16px] font-medium tracking-[-0.02em] text-ink-900 dark:text-white">
              Forma de la respuesta
            </h3>
            <CodeBlock label="Respuesta de ejemplo" code={EXAMPLE_RESPONSE} />
          </section>

          <section
            id="errores"
            className="mt-14 scroll-mt-28 border-t border-ink-300 pt-8 dark:border-white/12"
          >
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900 dark:text-white">
              Errores
            </h2>

            <div
              role="region"
              aria-label="Tabla de códigos de error: desplazable en horizontal"
              tabIndex={0}
              className="mt-5 overflow-x-auto overscroll-x-contain"
            >
              <table className="w-full min-w-[420px] border-collapse text-left">
                <caption className="sr-only">
                  Códigos de error HTTP de la API v1 y qué significa cada uno.
                </caption>
                <thead>
                  <tr className="border-y border-ink-300 dark:border-white/12">
                    <th
                      scope="col"
                      className="w-24 py-3 pr-6 text-[12px] font-medium tracking-[0.04em] text-ink-500 uppercase dark:text-ink-400"
                    >
                      Código
                    </th>
                    <th
                      scope="col"
                      className="py-3 text-[12px] font-medium tracking-[0.04em] text-ink-500 uppercase dark:text-ink-400"
                    >
                      Qué significa
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {STATUS_ROWS.map((row) => (
                    <tr
                      key={row.code}
                      className="border-b border-ink-300 align-top dark:border-white/12"
                    >
                      <th
                        scope="row"
                        className="w-24 py-3 pr-6 text-left font-mono text-[13px] font-normal text-ink-900 dark:text-white"
                      >
                        {row.code}
                      </th>
                      <td className="py-3 text-[13px] leading-relaxed text-ink-600 dark:text-ink-400">
                        {row.meaning}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-ink-600 dark:text-ink-400">
              Los errores devuelven{" "}
              <Code>{`{ "error": "…", "status": 404 }`}</Code>. Las claves
              revocadas, inexistentes y mal formadas comparten el mismo 401 para
              no filtrar si una clave existe.
            </p>
          </section>

          <section
            id="fuera-de-la-api"
            className="mt-14 scroll-mt-28 border-t border-ink-300 pt-8 dark:border-white/12"
          >
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900 dark:text-white">
              Fuera de la API
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-600 dark:text-ink-400">
              Las declaraciones patrimoniales de funcionarios de EE.UU. no se
              redistribuyen por la API ni se venden como dataset. En
              fraccion.si, las posiciones reconstruidas son para suscriptores.
              Los informes oficiales siguen públicos y gratis en los sitios de
              la Cámara, el Senado y la OGE, conforme a 5 U.S.C. § 13107.
            </p>
            <ul className="mt-5 border-t border-ink-300 dark:border-white/12">
              {excluded.map(([slug, item]) => (
                <li
                  key={slug}
                  className="flex flex-col gap-1 border-b border-ink-300 py-3 dark:border-white/12 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                >
                  <Code>{slug}</Code>
                  <span className="max-w-xl text-[12px] leading-relaxed text-ink-500 dark:text-ink-400">
                    {item.reason} ({item.law})
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section
            id="licencia"
            className="mt-14 scroll-mt-28 border-t border-ink-300 pt-8 dark:border-white/12"
          >
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900 dark:text-white">
              Licencia y datos personales
            </h2>
            {/* Mismo copy de src/lib/legal.ts que usa <LegalNotice>, con variantes dark. */}
            <div className="mt-3 max-w-[70ch] space-y-3 text-[15px] leading-relaxed text-ink-600 dark:text-ink-400">
              <p>
                Solo entregamos el agregado por empresa de InfoProbidad (CC BY
                4.0): nunca nombres, cargos ni datos de familiares. La API no
                guarda IP ni user-agent; solo el contador diario por clave, en
                línea con las Leyes 19.628 y 21.719.
              </p>
              <p>{LEGAL_NOTICES.fintec}</p>
              <p>
                {LEGAL_NOTICES.us_disclosure} Fuente oficial:{" "}
                {US_DISCLOSURE_SOURCES.map((source, index) => (
                  <span key={source.href}>
                    {index > 0 ? " · " : null}
                    <a
                      href={source.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink-900 underline underline-offset-4 dark:text-white"
                    >
                      {source.label} <span aria-hidden>↗</span>
                      <span className="sr-only">
                        {" "}
                        (abre fuera de fraccion.si)
                      </span>
                    </a>
                  </span>
                ))}
                .
              </p>
              <p className="text-[12px] leading-relaxed text-ink-500 dark:text-ink-400">
                {LEGAL_PAGE_LINKS.map((link, index) => (
                  <span key={link.href}>
                    {index > 0 ? " · " : null}
                    <Link
                      href={link.href}
                      className="text-ink-900 underline underline-offset-4 dark:text-white"
                    >
                      {link.label}
                    </Link>
                  </span>
                ))}
              </p>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
