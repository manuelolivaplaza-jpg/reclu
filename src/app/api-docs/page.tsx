import { withSeo } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ButtonLink } from "@/components/ui/button";
import { LegalNotice } from "@/components/legal/legal-notice";
import {
  API_BASE_PATH,
  API_DATASETS,
  EXCLUDED_API_DATASETS,
} from "@/lib/api-datasets";

export const metadata: Metadata = withSeo("/api-docs", {
  title: "API de datos",
  description:
    "API pública de datos chilenos de reclu.cl: AFP, corredoras, InfoProbidad, dividendos, hechos esenciales e insiders. JSON paginado con licencia y atribución.",
});

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

export default function ApiDocsPage() {
  const datasets = Object.values(API_DATASETS);
  const excluded = Object.entries(EXCLUDED_API_DATASETS);

  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <div className="container-page py-16 md:py-20">
          <p className="text-[11px] tracking-[0.08em] text-ink-500 uppercase">
            API v1
          </p>
          <h1 className="type-section mt-3 text-ink-900">API.</h1>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-600">
            Datos públicos chilenos en JSON, con licencia y atribución en cada
            respuesta. Sin ejecutar órdenes, sin enrutarlas y sin
            recomendaciones personalizadas.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-5">
            <ButtonLink href="/settings/api" size="lg">
              Crear una clave
            </ButtonLink>
            <Link
              href="/disclaimer"
              className="text-[15px] text-ink-900 underline-offset-4 hover:underline"
            >
              Leer el disclaimer
            </Link>
          </div>

          <section className="mt-16 border-t border-ink-200 pt-8">
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
              Autenticación
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-600">
              Crea una clave en{" "}
              <Link
                href="/settings/api"
                className="text-ink-900 underline underline-offset-4"
              >
                Ajustes → API
              </Link>
              . Viaja en la cabecera{" "}
              <code className="text-[13px] text-ink-900">
                Authorization: Bearer rcl_…
              </code>
              . La clave es personal: no la compartas ni la subas a un
              repositorio.
            </p>

            <pre className="mt-5 overflow-x-auto border border-ink-200 p-4 text-[12px] leading-relaxed text-ink-900">
              <code>{`curl -H "Authorization: Bearer rcl_..." \\
  "https://reclu.cl${API_BASE_PATH}/dividendos?page=1&per_page=50"`}</code>
            </pre>

            <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
              Todo el acceso está apagado mientras{" "}
              <code className="text-[12px] text-ink-900">
                API_PUBLIC_ENABLED
              </code>{" "}
              no sea exactamente{" "}
              <code className="text-[12px] text-ink-900">true</code>. El límite
              diario depende del plan vigente del dueño de la clave: Gratis
              100, Pro 1.000 y Elite 10.000 llamadas por día (UTC). Cada
              respuesta incluye las cabeceras{" "}
              <code className="text-[12px] text-ink-900">X-RateLimit-*</code>.
            </p>
          </section>

          <section className="mt-14 border-t border-ink-200 pt-8">
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
              Datasets
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-600">
              La lista es cerrada. Cada endpoint responde con{" "}
              <code className="text-[13px] text-ink-900">license</code>,{" "}
              <code className="text-[13px] text-ink-900">attribution</code>,{" "}
              <code className="text-[13px] text-ink-900">source_url</code> y
              paginación.
            </p>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-y border-ink-200 text-[12px] tracking-[0.04em] text-ink-500 uppercase">
                    <th className="py-3 pr-4 font-medium">Dataset</th>
                    <th className="py-3 pr-4 font-medium">Qué entrega</th>
                    <th className="py-3 pr-4 font-medium">
                      Licencia y atribución
                    </th>
                    <th className="py-3 font-medium">Filtros</th>
                  </tr>
                </thead>
                <tbody>
                  {datasets.map((dataset) => (
                    <tr
                      key={dataset.slug}
                      className="border-b border-ink-200 align-top"
                    >
                      <td className="py-4 pr-4">
                        <Link
                          href={`${API_BASE_PATH}/${dataset.slug}`}
                          className="text-[15px] font-medium text-ink-900 underline-offset-4 hover:underline"
                        >
                          {dataset.label}
                        </Link>
                        <p className="mt-1 font-mono text-[12px] text-ink-500">
                          {API_BASE_PATH}/{dataset.slug}
                        </p>
                      </td>
                      <td className="max-w-sm py-4 pr-4 text-[13px] leading-relaxed text-ink-600">
                        {dataset.description}
                      </td>
                      <td className="max-w-xs py-4 pr-4 text-[13px] leading-relaxed text-ink-600">
                        <p className="text-ink-900">{dataset.license}</p>
                        <p className="mt-1">{dataset.attribution}</p>
                        <a
                          href={dataset.licenseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-[12px] text-ink-900 underline underline-offset-4"
                        >
                          Ver términos
                        </a>
                      </td>
                      <td className="py-4 font-mono text-[12px] leading-relaxed text-ink-500">
                        {dataset.filters.join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-14 border-t border-ink-200 pt-8">
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
              Paginación y forma de la respuesta
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-600">
              Usa{" "}
              <code className="text-[13px] text-ink-900">page</code> (desde 1)
              y{" "}
              <code className="text-[13px] text-ink-900">per_page</code> (máximo
              100; por defecto 50). También se aceptan{" "}
              <code className="text-[13px] text-ink-900">offset</code> y{" "}
              <code className="text-[13px] text-ink-900">limit</code>.
            </p>

            <pre className="mt-5 overflow-x-auto border border-ink-200 p-4 text-[12px] leading-relaxed text-ink-900">
              <code>{EXAMPLE_RESPONSE}</code>
            </pre>
          </section>

          <section className="mt-14 border-t border-ink-200 pt-8">
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
              Errores
            </h2>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left">
                <tbody>
                  {STATUS_ROWS.map((row) => (
                    <tr key={row.code} className="border-b border-ink-200">
                      <td className="w-20 py-3 pr-4 font-mono text-[13px] text-ink-900">
                        {row.code}
                      </td>
                      <td className="py-3 text-[13px] leading-relaxed text-ink-600">
                        {row.meaning}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-ink-500">
              Los errores devuelven{" "}
              <code className="text-[12px] text-ink-900">
                {`{ "error": "…", "status": 404 }`}
              </code>
              . Las claves revocadas, inexistentes y mal formadas comparten el
              mismo 401 para no filtrar si una clave existe.
            </p>
          </section>

          <section className="mt-14 border-t border-ink-200 pt-8">
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
              Fuera de la API
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-600">
              Las declaraciones patrimoniales de funcionarios de EE.UU. no se
              venden ni se ponen detrás de una clave. Siguen gratis y fuera de
              cualquier muro en el sitio, conforme a 5 U.S.C. § 13107.
            </p>
            <ul className="mt-5 border-t border-ink-200">
              {excluded.map(([slug, item]) => (
                <li
                  key={slug}
                  className="flex flex-col gap-1 border-b border-ink-200 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                >
                  <code className="font-mono text-[13px] text-ink-900">
                    {slug}
                  </code>
                  <span className="max-w-xl text-[12px] leading-relaxed text-ink-500">
                    {item.reason} ({item.law})
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-14 flex flex-col gap-4">
            <LegalNotice kind="fintec" />
            <LegalNotice kind="us_disclosure" />
            <p className="text-[12px] leading-relaxed text-ink-500">
              Solo entregamos el agregado por empresa de InfoProbidad (CC BY
              4.0): nunca nombres, cargos ni datos de familiares. La API no
              guarda IP ni user-agent; solo el contador diario por clave, en
              línea con las Leyes 19.628 y 21.719.
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
