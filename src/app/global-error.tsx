"use client";

/**
 * Ultimo recurso: errores en el layout raíz (app/error.tsx no los captura).
 * Debe renderizar su propio <html> y <body>; sin dependencias del layout.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es-CL">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.25rem",
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
          color: "#0a0a0a",
          background: "radial-gradient(900px 360px at 50% -80px, rgba(15,122,50,0.08), transparent 70%), #fafafa",
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: 440,
            background: "#fff",
            border: "1px solid #e6e6e6",
            borderRadius: 16,
            boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.06)",
            padding: "1.75rem",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.04em" }}>reclu</div>
          <svg viewBox="0 0 200 60" style={{ width: "100%", height: "auto", margin: "1.25rem 0 0.5rem" }} aria-hidden>
            <path d="M0,20 L40,26 L80,18 L120,32 L160,44 L200,54" fill="none" stroke="#c81e1e" strokeWidth="2" strokeLinecap="round" />
            <circle cx="200" cy="54" r="4" fill="#c81e1e" />
          </svg>
          <h1 style={{ fontSize: 26, lineHeight: 1.1, letterSpacing: "-0.03em", margin: "0.5rem 0 0.75rem" }}>Algo salió mal</h1>
          <p style={{ color: "#6b6b6b", fontSize: 15, lineHeight: 1.6, margin: "0 0 1.5rem" }}>
            Tuvimos un problema al cargar reclu. Intenta de nuevo en unos segundos.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              width: "100%",
              height: 48,
              borderRadius: 999,
              border: 0,
              background: "#0a0a0a",
              color: "#fff",
              fontSize: 15,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
          <p style={{ marginTop: "1.25rem", fontSize: 13, color: "#6b6b6b", textAlign: "center" }}>
            Si sigue fallando, escríbenos a <a href="mailto:hola@reclu.cl" style={{ color: "#0a0a0a" }}>hola@reclu.cl</a>.
            {error?.digest ? <span style={{ display: "block", marginTop: 6, color: "#9a9a9a" }}>Código: {error.digest}</span> : null}
          </p>
        </main>
      </body>
    </html>
  );
}
