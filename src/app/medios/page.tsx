import { withSeo } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalNotice } from "@/components/legal/legal-notice";
import { WidgetEmbedCode } from "@/components/widget-embed-code";
import { siteUrl } from "@/lib/site";
import {
  WIDGET_META,
  WIDGET_TIPOS,
  widgetIframeCode,
  type WidgetTipo,
} from "@/lib/widgets";

export const metadata: Metadata = withSeo("/medios", {
  title: "Widgets para medios",
  description:
    "Widgets incrustables de fraccion.si para medios y creadores: consenso de corredoras, carteras de AFP, últimas compras de insiders y el ranking honesto. Con atribución \"Datos de fraccion.si\".",
  alternates: { canonical: "/medios" },
});

/**
 * /medios — catálogo de widgets incrustables (F52).
 *
 * Cada widget muestra su código de iframe listo para copiar, una vista
 * previa en vivo y las condiciones de uso. Todos llevan la atribución
 * "Datos de reclu.cl" dentro del propio iframe, así que la atribución
 * sobrevive aunque el medio no agregue un crédito aparte.
 *
 * Los widgets con datos de funcionarios de EE.UU. (insiders, ranking) son
 * gratis: 5 U.S.C. § 13107 exige que esos datos estén disponibles sin muro.
 * Ningún widget usa datos personales de InfoProbidad ni da recomendaciones
 * personalizadas (Ley Fintec).
 */
export default function MediosPage() {
  const baseUrl = siteUrl();

  return (
    <>
      <SiteHeader />
      <main id="main">
        <div className="container-page max-w-3xl py-16 md:py-20">
          <p className="label-line">Para medios y creadores</p>
          <h1 className="type-section mt-3 text-ink-900">
            Widgets para tus historias.
          </h1>
          <p className="type-body mt-5">
            Cuatro widgets incrustables con datos públicos de fraccion.si:
            consenso de corredoras chilenas, carteras de AFP, últimas compras de
            insiders de EE.UU. y el ranking honesto. Copia el código, pégalo en
            tu CMS y listo — sin registro ni API keys.
          </p>

          <p className="mt-6 text-[14px] leading-relaxed text-ink-600">
            Los widgets con datos de funcionarios de EE.UU.{" "}
            <Link
              href="/disclaimer"
              className="text-ink-900 underline underline-offset-4"
            >
              son públicos y gratis
            </Link>
            . El resto es información pública agregada, no recomendaciones de
            inversión.
          </p>

          <ol className="mt-14 space-y-14">
            {WIDGET_TIPOS.map((tipo) => (
              <WidgetSection key={tipo} tipo={tipo} baseUrl={baseUrl} />
            ))}
          </ol>

          <section className="mt-16">
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
              Condiciones de uso
            </h2>
            <div className="mt-5 space-y-3 text-[15px] leading-relaxed text-ink-600">
              <p>
                <strong className="font-medium text-ink-900">Atribución.</strong>{" "}
                El iframe ya incluye el crédito{" "}
                <em>“Datos de fraccion.si”</em> en su pie. Si tu medio prefiere
                además un crédito en el texto, úsalo tal cual:{" "}
                <em>Datos de fraccion.si</em>.
              </p>
              <p>
                <strong className="font-medium text-ink-900">
                  Gratuidad de datos de EE.UU.
                </strong>{" "}
                Los widgets con declaraciones de funcionarios de EE.UU.
                (insiders, ranking) son gratis para cualquier medio, conforme a{" "}
                <span className="num">5 U.S.C. § 13107</span>: esos datos deben
                estar disponibles sin muro de pago.
              </p>
              <p>
                <strong className="font-medium text-ink-900">
                  Sin recomendaciones.
                </strong>{" "}
                fraccion.si entrega información pública con fines informativos. No
                ejecuta órdenes ni da asesoría de inversión personalizada (Ley
                21.521). No presentes un widget como recomendación de comprar
                o vender.
              </p>
              <p>
                <strong className="font-medium text-ink-900">
                  Datos personales.
                </strong>{" "}
                Los widgets muestran únicamente información pública agregada o
                datos que la ley obliga a publicar. No usamos datos personales
                de InfoProbidad (Leyes 19.628 y 21.719).
              </p>
              <p>
                <strong className="font-medium text-ink-900">
                  Sin modificar el iframe.
                </strong>{" "}
                No alteres el contenido del widget ni lo uses para implicar que
                fraccion.si respalda tu nota. Si un dato te parece incorrecto,{" "}
                <Link
                  href="/disclaimer"
                  className="text-ink-900 underline underline-offset-4"
                >
                  revisa el disclaimer
                </Link>
                .
              </p>
            </div>

            <div className="mt-8">
              <LegalNotice kind="fintec" />
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function WidgetSection({
  tipo,
  baseUrl,
}: {
  tipo: WidgetTipo;
  baseUrl: string;
}) {
  const meta = WIDGET_META[tipo];
  const code = widgetIframeCode(tipo, baseUrl);
  const previewUrl = `${baseUrl}/embed/widget/${tipo}`;

  return (
    <li id={tipo} className="scroll-mt-24">
      <div className="flex items-baseline gap-3">
        <span className="num text-[12px] text-ink-500">
          {String(WIDGET_TIPOS.indexOf(tipo) + 1).padStart(2, "0")}
        </span>
        <h2 className="text-[22px] font-medium tracking-[-0.03em] text-ink-900">
          {meta.title}
        </h2>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-600">
        {meta.description}
      </p>
      <WidgetEmbedCode code={code} previewUrl={previewUrl} height={meta.height} />
    </li>
  );
}
