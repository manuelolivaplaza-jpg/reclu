/**
 * JsonLd — inserta un bloque <script type="application/ld+json"> con el
 * objeto entregado. Server component: el objeto se serializa una vez en
 * el servidor, el cliente recibe solo el HTML.
 *
 * Uso (en /portfolio/[slug]):
 *   <JsonLd data={datasetSchema} />
 *   <JsonLd data={breadcrumbSchema} />
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify escapa las etiquetas de cierre (</script>) del contenido.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
