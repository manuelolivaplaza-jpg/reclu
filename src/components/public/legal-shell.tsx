import Link from "next/link";
import { ArrowLeft, ChevronDown, FileText, Lock, ShieldCheck } from "lucide-react";

export interface LegalTocItem {
  id: string;
  label: string;
}

type LegalKind = "terminos" | "privacidad" | "disclaimer";

const KIND: Record<LegalKind, { kicker: string; blurb: string }> = {
  terminos: { kicker: "Legal · Términos", blurb: "Las reglas de uso de fraccion.si, en un formato fácil de recorrer." },
  privacidad: { kicker: "Legal · Privacidad", blurb: "Qué datos guardamos, para qué y cómo los protegemos." },
  disclaimer: { kicker: "Legal · Aviso", blurb: "fraccion.si muestra información pública. No es asesoría de inversión." },
};

const OTHER_DOCS: { href: string; label: string; kind: LegalKind }[] = [
  { href: "/terminos", label: "Términos", kind: "terminos" },
  { href: "/privacidad", label: "Privacidad", kind: "privacidad" },
  { href: "/disclaimer", label: "Aviso", kind: "disclaimer" },
];

/** Icono del documento. Se renderiza aquí (Server Component), nunca se pasa como prop. */
function KindIcon({ kind }: { kind: LegalKind }) {
  if (kind === "privacidad") return <Lock className="size-5" aria-hidden />;
  if (kind === "disclaimer") return <ShieldCheck className="size-5" aria-hidden />;
  return <FileText className="size-5" aria-hidden />;
}

/**
 * Encabezado + índice para las páginas legales. Solo presentación: el texto
 * legal vive intacto en cada página y se pasa como children.
 *
 * El índice lateral es sticky en escritorio; en móvil se pliega con <details>
 * nativo (sin JS) para no dejar una lista eterna antes del documento.
 */
export function LegalShell({
  kind,
  title,
  updated,
  toc,
  children,
}: {
  kind: LegalKind;
  title: string;
  updated?: string;
  toc: LegalTocItem[];
  children: React.ReactNode;
}) {
  const meta = KIND[kind];
  return (
    <div className="print:bg-white">
      <div className="container-page pb-20 pt-6 md:pb-28 md:pt-10 print:pb-0 print:pt-0">
        <div className="mx-auto w-full max-w-[1080px]">
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 text-[13px] font-medium text-ink-700 transition-colors hover:border-ink-900 hover:text-ink-900 dark:border-white/15 dark:bg-transparent dark:text-ink-300 dark:hover:border-white/45 dark:hover:text-white print:hidden"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Inicio
          </Link>

          <header className="pub-rise mt-5 border border-ink-200 bg-white p-5 md:p-8 dark:border-white/12 dark:bg-white/[0.03] print:mt-0 print:border-0 print:bg-white print:p-0">
            <div className="flex items-start gap-4">
              <span className="pub-icon-tile shrink-0 print:hidden">
                <KindIcon kind={kind} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
                  {meta.kicker}
                </p>
                <h1 className="mt-2 text-[28px] font-semibold leading-[1.08] tracking-[-0.03em] text-ink-900 md:text-[40px] dark:text-white print:text-[26px] print:text-black">
                  {title}
                </h1>
                <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-ink-500 dark:text-ink-400 print:text-black">
                  {meta.blurb}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] leading-snug">
              {updated ? (
                <>
                  <p className="font-medium text-ink-700 dark:text-ink-200 print:text-black">{updated}</p>
                  <span className="h-3 w-px bg-ink-300 dark:bg-white/20 print:hidden" aria-hidden />
                </>
              ) : null}
              <p className="text-ink-500 dark:text-ink-400 print:text-black">{toc.length} secciones</p>
            </div>

            <nav aria-label="Documentos legales" className="mt-5 flex gap-1 border border-ink-200 p-1 md:w-fit dark:border-white/12 print:hidden">
              {OTHER_DOCS.map((d) => (
                <Link
                  key={d.href}
                  href={d.href}
                  aria-current={d.kind === kind ? "page" : undefined}
                  className={
                    "flex-1 px-4 py-2 text-center text-[13px] font-medium transition-colors md:flex-none " +
                    (d.kind === kind
                      ? "bg-ink-900 text-white dark:bg-white dark:text-ink-900"
                      : "text-ink-500 hover:bg-ink-50 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/6 dark:hover:text-white")
                  }
                >
                  {d.label}
                </Link>
              ))}
            </nav>
          </header>

          <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12 print:mt-0 print:block">
            <aside className="hidden lg:block print:hidden">
              <nav aria-label="Índice del documento" className="sticky top-24 border border-ink-200 bg-white p-3 dark:border-white/12 dark:bg-white/[0.03]">
                <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
                  En esta página
                </p>
                <ol className="flex flex-col">
                  {toc.map((t, i) => (
                    <li key={t.id}>
                      <a
                        href={`#${t.id}`}
                        className="flex items-baseline gap-2 border-l border-transparent py-1.5 pl-3 pr-2 text-[13px] leading-snug text-ink-700 transition-colors hover:border-ink-900 hover:text-ink-900 dark:text-ink-300 dark:hover:border-white dark:hover:text-white"
                      >
                        <span className="num w-4 shrink-0 tabular-nums text-ink-500 dark:text-ink-400">{i + 1}</span>
                        <span className="min-w-0">{t.label}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>

            <div className="min-w-0">
              <details className="group mb-6 border border-ink-200 lg:hidden dark:border-white/12 print:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[13px] font-medium text-ink-900 [&::-webkit-details-marker]:hidden dark:text-white">
                  <span>Índice del documento</span>
                  <span className="flex items-center gap-2 text-[12px] font-normal text-ink-500 dark:text-ink-400">
                    {toc.length} secciones
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                  </span>
                </summary>
                <div className="border-t border-ink-200 px-4 py-3 dark:border-white/12">
                  <ol className="grid gap-x-6 sm:grid-cols-2">
                    {toc.map((t, i) => (
                      <li key={t.id}>
                        <a
                          href={`#${t.id}`}
                          className="flex items-baseline gap-2 py-1.5 text-[13px] leading-snug text-ink-700 dark:text-ink-300"
                        >
                          <span className="num w-4 shrink-0 tabular-nums text-ink-500 dark:text-ink-400">{i + 1}</span>
                          <span className="min-w-0">{t.label}</span>
                        </a>
                      </li>
                    ))}
                  </ol>
                </div>
              </details>

              <div className="max-w-[70ch]">{children}</div>

              <div className="pub-card-dark mt-10 flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-7 print:hidden">
                <div>
                  <p className="text-[17px] font-semibold tracking-[-0.02em]">¿Dudas sobre este documento?</p>
                  <p className="mt-1 text-[14px] text-white/60">Te respondemos en menos de 48 horas hábiles.</p>
                </div>
                <a
                  href="mailto:hola@fraccion.si"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-[14px] font-medium text-ink-900 hover:opacity-90"
                >
                  hola@fraccion.si
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
