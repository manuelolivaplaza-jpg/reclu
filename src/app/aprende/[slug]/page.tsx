import { articleSchema, breadcrumbSchema, faqSchema, withSeo } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { JsonLd } from "@/components/json-ld";
import {
  IndiceFicha,
  type SeccionFicha,
} from "@/components/aprende/indice-ficha";
import {
  AVISO_APRENDE,
  FICHAS_APRENDE,
  fichaPorSlug,
} from "@/content/aprende";

type AprendeFichaProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return FICHAS_APRENDE.map((ficha) => ({ slug: ficha.slug }));
}

export async function generateMetadata({
  params,
}: AprendeFichaProps): Promise<Metadata> {
  const { slug } = await params;
  const ficha = fichaPorSlug(slug);
  if (!ficha) {
    notFound();
  }
  return withSeo(`/aprende/${ficha.slug}`, {
    title: `${ficha.titulo} — Aprende`,
    description: ficha.resumen,
    // La ficha define su propio openGraph, así que hereda la imagen del
    // segmento padre solo si la declaramos explícitamente.
    openGraph: { images: [absoluteUrl("/aprende/opengraph-image")] },
  });
}

export default async function AprendeFichaPage({ params }: AprendeFichaProps) {
  const { slug } = await params;
  const ficha = fichaPorSlug(slug);
  if (!ficha) notFound();

  const ruta = `/aprende/${ficha.slug}`;
  // La FAQ usa el resumen tal como se ve en la página (más abajo): mismo texto,
  // sin datos nuevos. Si no hubiera resumen visible, no se emite FAQPage.
  const faq =
    ficha.resumen.trim().length > 0
      ? faqSchema([{ q: `¿Qué es ${ficha.titulo}?`, a: ficha.resumen }])
      : null;

  // Vecinas por orden del arreglo: la primera no tiene anterior y la última
  // no tiene siguiente.
  const posicion = FICHAS_APRENDE.findIndex((item) => item.slug === ficha.slug);
  const anterior = posicion > 0 ? FICHAS_APRENDE[posicion - 1] : null;
  const siguiente =
    posicion >= 0 && posicion < FICHAS_APRENDE.length - 1
      ? FICHAS_APRENDE[posicion + 1]
      : null;

  // El índice lista solo secciones que existen en esta ficha. `cuerpo` son
  // párrafos sin encabezado propio, así que no se les inventa un título: si
  // no llega a tres secciones, la ficha se lee igual y sin índice.
  const secciones: SeccionFicha[] = [
    ...(ficha.portafolios && ficha.portafolios.length > 0
      ? [{ id: "portafolios", etiqueta: "Portafolios relacionados" }]
      : []),
    { id: "fuentes", etiqueta: "Fuentes" },
    { id: "aviso", etiqueta: "Aviso" },
  ];
  const conIndice = secciones.length >= 3;

  return (
    <>
      <JsonLd
        data={articleSchema({
          headline: ficha.titulo,
          description: ficha.resumen,
          url: ruta,
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Inicio", path: "/" },
          { name: "Aprende", path: "/aprende" },
          { name: ficha.titulo, path: ruta },
        ])}
      />
      {faq ? <JsonLd data={faq} /> : null}

      <SiteHeader />
      <main id="main">
        <div className="container-page pb-24 pt-10 md:pt-14">
          <div className="mx-auto w-full max-w-5xl">
            <div
              className={`grid gap-12 lg:gap-16 ${
                conIndice ? "lg:grid-cols-[minmax(0,1fr)_14rem]" : ""
              }`}
            >
              <div className="min-w-0">
                <article>
                  <Link
                    href="/aprende"
                    aria-label="Volver a Aprende"
                    className="group label-line inline-flex min-h-11 items-center gap-1.5 transition-colors hover:text-ink-900 dark:hover:text-white"
                  >
                    <ArrowLeft
                      className="size-3.5 transition-transform group-hover:-translate-x-0.5"
                      aria-hidden
                    />
                    Aprende
                  </Link>

                  <h1 className="mt-2 text-balance text-[2rem] font-medium leading-[1.06] tracking-[-0.035em] text-ink-900 md:text-[2.75rem] dark:text-white">
                    {ficha.titulo}
                  </h1>
                  <p className="type-body mt-5 max-w-[62ch]">{ficha.resumen}</p>

                  <div className="mt-10 max-w-[68ch] space-y-5 text-pretty text-[16px] leading-[1.65] text-ink-700 dark:text-ink-200">
                    {ficha.cuerpo.map((parrafo) => (
                      <p key={parrafo}>{parrafo}</p>
                    ))}
                  </div>

                  {ficha.portafolios && ficha.portafolios.length > 0 ? (
                    <section
                      aria-labelledby="portafolios"
                      className="mt-14 border-t border-ink-300 pt-8 dark:border-white/12"
                    >
                      <h2
                        id="portafolios"
                        className="scroll-mt-28 text-[22px] font-medium tracking-[-0.03em] text-ink-900 dark:text-white"
                      >
                        Portafolios relacionados
                      </h2>
                      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
                        {ficha.portafolios.map((portafolio) => (
                          <li key={portafolio}>
                            <Link
                              href={`/portfolio/${portafolio}`}
                              className="group inline-flex min-h-11 items-center gap-1.5 text-[15px] text-ink-700 underline decoration-ink-300 underline-offset-4 transition-colors hover:text-ink-900 hover:decoration-ink-900 dark:text-ink-200 dark:decoration-white/25 dark:hover:text-white dark:hover:decoration-white"
                            >
                              {nombrePortafolio(portafolio)}
                              <ArrowRight
                                className="size-3.5 transition-transform group-hover:translate-x-0.5"
                                aria-hidden
                              />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <section
                    aria-labelledby="fuentes"
                    className="mt-14 border-t border-ink-300 pt-8 dark:border-white/12"
                  >
                    <h2
                      id="fuentes"
                      className="scroll-mt-28 text-[22px] font-medium tracking-[-0.03em] text-ink-900 dark:text-white"
                    >
                      Fuentes
                    </h2>
                    <ol className="mt-5 border-t border-ink-300 dark:border-white/12">
                      {ficha.fuentes.map((fuente, i) => {
                        const dominio = dominioVisible(fuente.url);
                        return (
                          <li
                            key={fuente.url}
                            className="border-b border-ink-300 dark:border-white/12"
                          >
                            <a
                              href={fuente.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group -mx-2 flex min-h-11 items-start gap-4 px-2 py-4 transition-colors hover:bg-ink-50 dark:hover:bg-white/[0.04]"
                            >
                              <span
                                aria-hidden
                                className="num mt-0.5 w-6 shrink-0 text-[12px] text-ink-400 dark:text-ink-500"
                              >
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[15px] leading-[1.5] text-ink-800 underline decoration-ink-300 underline-offset-4 transition-colors group-hover:text-ink-900 group-hover:decoration-ink-900 dark:text-ink-200 dark:decoration-white/25 dark:group-hover:text-white dark:group-hover:decoration-white">
                                  {fuente.titulo}
                                </span>
                                {dominio ? (
                                  <span className="mt-1 block text-[12px] text-ink-500 dark:text-ink-400">
                                    {dominio}
                                  </span>
                                ) : null}
                                <span className="sr-only">
                                  {" "}
                                  (se abre en otra pestaña)
                                </span>
                              </span>
                              <ExternalLink
                                className="mt-1 size-3.5 shrink-0 text-ink-400 dark:text-ink-500"
                                aria-hidden
                              />
                            </a>
                          </li>
                        );
                      })}
                    </ol>
                  </section>

                  <section
                    aria-labelledby="aviso"
                    className="mt-14 border-t border-ink-300 pt-8 dark:border-white/12"
                  >
                    <h2
                      id="aviso"
                      className="scroll-mt-28 text-[13px] font-medium text-ink-900 dark:text-white"
                    >
                      Aviso
                    </h2>
                    <p className="mt-3 max-w-[62ch] text-[12px] leading-[1.65] text-ink-500 dark:text-ink-400">
                      {AVISO_APRENDE}
                    </p>
                    <p className="mt-4 text-[12px] leading-[1.65] text-ink-500 dark:text-ink-400">
                      Cómo se calculan los datos y sus límites:{" "}
                      <Link
                        href="/metodologia"
                        className="text-ink-700 underline decoration-ink-300 underline-offset-4 transition-colors hover:text-ink-900 hover:decoration-ink-900 dark:text-ink-200 dark:decoration-white/25 dark:hover:text-white dark:hover:decoration-white"
                      >
                        Metodología
                      </Link>
                      {"."}
                    </p>
                  </section>
                </article>

                <nav
                  aria-label="Navegación entre fichas"
                  className="mt-16 flex flex-col gap-8 border-t border-ink-300 pt-8 dark:border-white/12 sm:flex-row sm:justify-between sm:gap-10"
                >
                  {anterior ? (
                    <Link
                      href={`/aprende/${anterior.slug}`}
                      className="group block min-w-0 sm:max-w-[46%]"
                    >
                      <span className="label-line flex items-center gap-1.5">
                        <ArrowLeft
                          className="size-3.5 transition-transform group-hover:-translate-x-0.5"
                          aria-hidden
                        />
                        Ficha anterior
                      </span>
                      <span className="mt-2 block text-pretty text-[17px] font-medium leading-snug tracking-[-0.02em] text-ink-900 underline-offset-4 group-hover:underline dark:text-white">
                        {anterior.titulo}
                      </span>
                    </Link>
                  ) : null}

                  {siguiente ? (
                    <Link
                      href={`/aprende/${siguiente.slug}`}
                      className="group block min-w-0 sm:ml-auto sm:max-w-[46%] sm:text-right"
                    >
                      <span className="label-line flex items-center gap-1.5 sm:justify-end">
                        Ficha siguiente
                        <ArrowRight
                          className="size-3.5 transition-transform group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </span>
                      <span className="mt-2 block text-pretty text-[17px] font-medium leading-snug tracking-[-0.02em] text-ink-900 underline-offset-4 group-hover:underline dark:text-white">
                        {siguiente.titulo}
                      </span>
                    </Link>
                  ) : null}
                </nav>
              </div>

              {conIndice ? <IndiceFicha secciones={secciones} /> : null}
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

/**
 * Dominio legible de una fuente, para que el lector pueda evaluarla antes de
 * abrirla. Si la URL no se puede leer, no se muestra nada inventado.
 */
function dominioVisible(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Etiqueta legible de un slug de portafolio, sin inventar nombres ni cifras:
 * separa por guiones y normaliza solo siglas conocidas.
 */
function nombrePortafolio(slug: string): string {
  const siglas: Record<string, string> = {
    "13f": "13F",
    "1m": "1M",
    afp: "AFP",
    cl: "CL",
    oge: "OGE",
    ptr: "PTR",
  };
  return slug
    .split("-")
    .map((parte) => {
      const sigla = siglas[parte.toLowerCase()];
      if (sigla) return sigla;
      return parte.charAt(0).toUpperCase() + parte.slice(1);
    })
    .join(" ");
}
