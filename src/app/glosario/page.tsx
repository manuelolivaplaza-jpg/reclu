import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { GlosarioLetras } from "@/components/glosario/glosario-letras";
import { AVISO_APRENDE } from "@/content/aprende";
import { withSeo } from "@/lib/seo";

export const metadata: Metadata = withSeo("/glosario", {
  title: "Glosario",
  description:
    "Los términos de los documentos públicos que sigue Fraccion, explicados en una o dos líneas y enlazados a su ficha: 13F, Formulario 4, PTR y STOCK Act, OGE 278-T, hechos esenciales, AFP, InfoProbidad, Ley Fintec, DJ 1929 y sesgos.",
});

/**
 * Una entrada por ficha de `FICHAS_APRENDE`: no hay dos fichas que definan el
 * mismo concepto, así que agrupar no aporta nada. Cuando una ficha cubre dos
 * nombres del mismo trámite (PTR y STOCK Act, AFP y multifondos), se conserva
 * el título de la ficha como término para no repetir la misma definición dos
 * veces. Un término que no tenga ficha no entra: la definición se apoya solo
 * en el resumen de `src/content/aprende.ts`, sin plazos, montos ni siglas
 * nuevas.
 */
type EntradaGlosario = {
  termino: string;
  /** Ficha de /aprende que respalda la definición. */
  slug: string;
  /** El resumen de la ficha, condensado a una o dos líneas. */
  definicion: string;
};

const ENTRADAS: readonly EntradaGlosario[] = [
  {
    termino: "AFP y multifondos",
    slug: "afp-multifondos",
    definicion:
      "Una AFP administra cuentas individuales de capitalización. Sus cinco fondos se distinguen por cuánta renta variable pueden tener: el A es el más expuesto y el E, el más conservador.",
  },
  {
    termino: "Declaración jurada 1929",
    slug: "dj-1929",
    definicion:
      "Informa al SII las operaciones en el exterior. No es el Formulario 22 ni asesoría tributaria; quien empezó a invertir en 2026 la presenta en 2027.",
  },
  {
    termino: "Formulario 13F",
    slug: "13f",
    definicion:
      "Los fondos grandes informan a la SEC, cada trimestre, las acciones y valores relacionados que tienen. Sale hasta 45 días después del cierre y no es la cartera completa.",
  },
  {
    termino: "Formulario 4",
    slug: "form-4",
    definicion:
      "Directores, altos ejecutivos y accionistas de 10% o más informan a la SEC la mayoría de sus operaciones. Vence antes del cierre del segundo día hábil siguiente.",
  },
  {
    termino: "Hecho esencial",
    slug: "hecho-esencial",
    definicion:
      "En Chile, información relevante sobre un emisor y sus negocios. La CMF lo recibe y lo publica tal como llega, sin responder por su veracidad.",
  },
  {
    termino: "InfoProbidad",
    slug: "infoprobidad",
    definicion:
      "Datos abiertos del Consejo para la Transparencia y la Contraloría con declaraciones de probidad de autoridades. Licencia CC BY 4.0; se actualizan los martes y los viernes.",
  },
  {
    termino: "Ley Fintec",
    slug: "ley-fintec",
    definicion:
      "La Ley N° 21.521 define la asesoría de inversión como evaluar o recomendar si a un tercero le conviene una operación. Fraccion no recomienda, no ejecuta órdenes ni las enruta.",
  },
  {
    termino: "OGE Form 278-T",
    slug: "oge-278-t",
    definicion:
      "Quienes declaran patrimonio público en el poder ejecutivo de EE.UU. informan ciertas compras y ventas: 30 días desde que se enteran y nunca más de 45 días después de la operación.",
  },
  {
    termino: "PTR y la STOCK Act",
    slug: "ptr-stock-act",
    definicion:
      "La STOCK Act de 2012 obliga a los miembros del Congreso a informar sus operaciones en acciones. La ley ordena que esos informes sean públicos; el plazo que recoge Unusual Whales es de 30 a 45 días.",
  },
  {
    termino: "Sesgos de atraso y supervivencia",
    slug: "sesgos",
    definicion:
      "Un informe público llega después de la operación. Una lista de estrategias que siguen vivas omite las que se cerraron, como el ETF Inverse Cramer (SJIM), liquidado en 2024.",
  },
];

/** Orden alfabético en español y numérico: «Formulario 4» va antes que «Formulario 13F». */
const ORDEN_ES = new Intl.Collator("es", { sensitivity: "base", numeric: true });

/** Letra de índice sin tildes: «É» cae en la letra E. */
function letraDe(termino: string): string {
  return termino
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .charAt(0)
    .toUpperCase();
}

const ORDENADAS = [...ENTRADAS].sort((a, b) => ORDEN_ES.compare(a.termino, b.termino));

const GRUPOS = ORDENADAS.reduce<{ letra: string; entradas: EntradaGlosario[] }[]>(
  (acumulado, entrada) => {
    const letra = letraDe(entrada.termino);
    const ultimo = acumulado.at(-1);
    if (ultimo?.letra === letra) {
      ultimo.entradas.push(entrada);
    } else {
      acumulado.push({ letra, entradas: [entrada] });
    }
    return acumulado;
  },
  [],
);

export default function GlosarioPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-white dark:bg-ink-950">
        <div className="container-page pb-24 pt-10 md:pt-14">
          {/* Masthead editorial: una sola H1 y el dato de cuántos términos hay. */}
          <header className="border-b border-ink-300 pb-10 dark:border-white/12 md:pb-12">
            <p className="label-line">Referencia</p>
            <h1 className="type-section mt-4 text-ink-900 dark:text-white">Glosario.</h1>
            <p className="type-body mt-6 max-w-2xl">
              Los términos que aparecen en los documentos públicos que sigue Fraccion y en las
              reglas que los rodean. Cada entrada resume su ficha de Aprende y enlaza a ella, sin
              agregar plazos, montos ni siglas que la fuente no diga.
            </p>
            <p className="num mt-8 text-[13px] text-ink-500 dark:text-ink-400">
              {ORDENADAS.length} términos · {GRUPOS.length} letras
            </p>
          </header>

          <GlosarioLetras letras={GRUPOS.map((grupo) => grupo.letra)} />

          <div>
            {GRUPOS.map((grupo) => {
              const ancla = grupo.letra.toLowerCase();
              const tituloId = `letra-${ancla}`;
              return (
                <section
                  key={grupo.letra}
                  id={ancla}
                  aria-labelledby={tituloId}
                  className="mt-12 scroll-mt-28 border-t border-ink-300 pt-8 first:mt-0 first:border-t-0 dark:border-white/12"
                >
                  <div className="flex items-baseline gap-4">
                    <h2
                      id={tituloId}
                      className="text-[28px] font-medium leading-none tracking-[-0.03em] text-ink-900 dark:text-white"
                    >
                      {grupo.letra}
                    </h2>
                    <span className="num text-[12px] text-ink-500 dark:text-ink-400">
                      {grupo.entradas.length}{" "}
                      {grupo.entradas.length === 1 ? "término" : "términos"}
                    </span>
                  </div>

                  <dl className="mt-4 divide-y divide-ink-300 dark:divide-white/12">
                    {grupo.entradas.map((entrada) => (
                      <div key={entrada.termino} className="grid gap-2 py-7 md:grid-cols-12 md:gap-8">
                        <dt className="md:col-span-4">
                          <span className="text-[17px] font-medium tracking-[-0.02em] text-ink-900 dark:text-white">
                            {entrada.termino}
                          </span>
                        </dt>
                        <dd className="md:col-span-8">
                          <p className="max-w-[70ch] text-[15px] leading-relaxed text-ink-600 dark:text-ink-400">
                            {entrada.definicion}
                          </p>
                          <Link
                            href={`/aprende/${entrada.slug}`}
                            className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-ink-900 transition-colors hover:text-ink-600 dark:text-white dark:hover:text-ink-300"
                          >
                            <span className="border-b border-current pb-0.5">
                              Leer la ficha completa
                            </span>
                            <span aria-hidden>→</span>
                          </Link>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>

          <aside
            aria-labelledby="aviso-glosario"
            className="mt-20 border border-ink-300 p-6 dark:border-white/12 md:p-8"
          >
            <h2
              id="aviso-glosario"
              className="text-[13px] font-medium text-ink-900 dark:text-white"
            >
              Aviso
            </h2>
            <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-ink-600 dark:text-ink-400">
              {AVISO_APRENDE}
            </p>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
