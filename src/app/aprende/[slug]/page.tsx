import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
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
    return { title: "Ficha no encontrada" };
  }
  return {
    title: `${ficha.titulo} — Aprende`,
    description: ficha.resumen,
    alternates: { canonical: `/aprende/${ficha.slug}` },
  };
}

export default async function AprendeFichaPage({ params }: AprendeFichaProps) {
  const { slug } = await params;
  const ficha = fichaPorSlug(slug);
  if (!ficha) notFound();

  const otras = FICHAS_APRENDE.filter((item) => item.slug !== ficha.slug);

  return (
    <>
      <SiteHeader />
      <main id="main">
        <div className="container-page max-w-3xl py-16 md:py-20">
          <Link
            href="/aprende"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
          >
            <ArrowLeft className="size-4" />
            Volver a Aprende
          </Link>

          <p className="label-line mt-8">Educación</p>
          <h1 className="type-section mt-3 text-ink-900">{ficha.titulo}</h1>
          <p className="type-body mt-5">{ficha.resumen}</p>

          <div className="mt-10 space-y-4 text-[15px] leading-relaxed text-ink-600">
            {ficha.cuerpo.map((parrafo) => (
              <p key={parrafo}>{parrafo}</p>
            ))}
          </div>

          <section className="mt-14">
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
              Fuentes
            </h2>
            <ul className="mt-5 list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-ink-600">
              {ficha.fuentes.map((fuente) => (
                <li key={fuente.url}>
                  <a
                    href={fuente.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    {fuente.titulo}
                    <span className="sr-only"> (se abre en otra pestaña)</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <nav className="mt-14" aria-label="Otras fichas">
            <h2 className="text-[15px] font-medium text-ink-900">Otras fichas</h2>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
              {otras.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/aprende/${item.slug}`}
                    className="underline underline-offset-4"
                  >
                    {item.titulo}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* TODO(F16): reemplazar por src/components/legal/legal-notice.tsx */}
          <section className="mt-16 border-t border-ink-200 pt-8">
            <h2 className="text-[15px] font-medium text-ink-900">Aviso</h2>
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              {AVISO_APRENDE}
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
