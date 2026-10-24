"use client";

/**
 * Último recurso: errores en el layout raíz (app/error.tsx no los captura).
 * Debe renderizar su propio <html> y <body>; sin dependencias del layout.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es-CL">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "4rem 1.5rem", textAlign: "center", color: "#111" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>Algo salió mal</h1>
        <p style={{ color: "#555", marginBottom: "1.5rem" }}>
          Tuvimos un problema al cargar reclu. Intenta de nuevo en unos segundos.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{ padding: "0.6rem 1.2rem", borderRadius: 8, border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer" }}
        >
          Reintentar
        </button>
        <p style={{ marginTop: "2rem", fontSize: "0.85rem", color: "#777" }}>
          Si sigue fallando, escríbenos a <a href="mailto:hola@reclu.cl">hola@reclu.cl</a>.
        </p>
      </body>
    </html>
  );
}
