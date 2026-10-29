import Link from "next/link";
import { ArrowLeft, FileText, Lock, ShieldCheck } from "lucide-react";

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
    <div className="pub-canvas">
      <div className="container-page pb-20 pt-6 md:pb-28 md:pt-10">
        <Link
          href="/"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 text-[13px] font-medium text-ink-700 transition-colors hover:text-ink-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Inicio
        </Link>

        <header className="pub-card pub-rise mt-5 overflow-hidden p-5 md:p-8">
          <div className="flex items-start gap-4">
            <span className="pub-icon-tile shrink-0">
              <KindIcon kind={kind} />
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-ink-500">{meta.kicker}</p>
              <h1 className="mt-1 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink-900 md:text-[40px]">
                {title}
              </h1>
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-500">{meta.blurb}</p>
            </div>
          </div>
          <div className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:px-0">
            {updated && (
              <span className="pub-chip pub-chip-positive">
                <span className="pub-dot" aria-hidden />
                {updated}
              </span>
            )}
            <span className="pub-chip">{toc.length} secciones</span>
            <span className="pub-chip">Información pública</span>
            <span className="pub-chip">Sin custodia de fondos</span>
          </div>
          <nav aria-label="Documentos legales" className="mt-5 flex gap-1 rounded-full bg-ink-50 p-1 md:w-fit">
            {OTHER_DOCS.map((d) => (
              <Link
                key={d.href}
                href={d.href}
                aria-current={d.kind === kind ? "page" : undefined}
                className={
                  "flex-1 rounded-full px-4 py-2 text-center text-[13px] font-medium transition-colors md:flex-none " +
                  (d.kind === kind ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-900")
                }
              >
                {d.label}
              </Link>
            ))}
          </nav>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
          <aside className="hidden lg:block">
            <nav aria-label="Índice" className="pub-card sticky top-24 p-4">
              <p className="px-2 text-[12px] font-medium text-ink-500">En esta página</p>
              <ol className="mt-2 flex flex-col">
                {toc.map((t, i) => (
                  <li key={t.id}>
                    <a
                      href={`#${t.id}`}
                      className="flex gap-2 rounded-lg px-2 py-1.5 text-[13px] leading-snug text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900"
                    >
                      <span className="num w-5 shrink-0 text-ink-400">{i + 1}</span>
                      <span className="min-w-0">{t.label}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <div className="min-w-0">
            <nav aria-label="Índice" className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 lg:hidden">
              {toc.map((t, i) => (
                <a key={t.id} href={`#${t.id}`} className="pub-chip">
                  <span className="num text-ink-400">{i + 1}</span>
                  {t.label}
                </a>
              ))}
            </nav>
            <div className="mt-4 lg:mt-0">{children}</div>
            <div className="pub-card-dark mt-6 flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between md:p-7">
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
  );
}
