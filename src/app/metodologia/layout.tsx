import { JsonLd } from "@/components/json-ld";
import { articleSchema, breadcrumbSchema } from "@/lib/seo";

/**
 * /metodologia: la página es un server component con su propio `metadata`
 * (no se toca desde aquí). Este layout solo agrega el JSON-LD editorial:
 * Article + BreadcrumbList.
 *
 * Sin preguntas frecuentes estructuradas a propósito: la página no muestra
 * una sección de preguntas visibles y su texto está siendo reescrito en otra
 * rama; un marcado de FAQ sin preguntas en pantalla no correspondería.
 */
export default function MetodologiaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd
        data={articleSchema({
          headline: "Metodología",
          description:
            "Cómo calcula fraccion.si el rendimiento de los portafolios: precios de cierre, ventanas de retorno, Sharpe, máxima caída, comparación contra S&P 500 e IPSA, el ranking honesto, el muro de 90 días, los datos públicos de funcionarios y la anonimización de personas naturales.",
          url: "/metodologia",
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Inicio", path: "/" },
          { name: "Metodología", path: "/metodologia" },
        ])}
      />
      {children}
    </>
  );
}
