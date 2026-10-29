import { ImageResponse } from "next/og";

/** D60: tarjeta OG genérica (mismo lenguaje visual que la OG de portafolios). */
export const OG_SIZE = { width: 1200, height: 630 };

export function ogCard({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", backgroundColor: "#0a0a0a", color: "#ffffff", padding: "56px 64px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #262626", paddingBottom: "24px" }}>
          <div style={{ display: "flex", fontSize: "28px", fontWeight: 600, letterSpacing: "-0.04em" }}>fraccion</div>
          <div style={{ display: "flex", fontSize: "14px", letterSpacing: "0.08em", color: "#8a8a8a" }}>{kicker.toUpperCase()}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "1000px" }}>
          <div style={{ display: "flex", fontSize: "64px", fontWeight: 500, lineHeight: 1.04, letterSpacing: "-0.045em" }}>{title}</div>
          {subtitle ? <div style={{ display: "flex", fontSize: "26px", color: "#a3a3a3" }}>{subtitle}</div> : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #262626", paddingTop: "24px", fontSize: "16px", color: "#8a8a8a" }}>
          <div style={{ display: "flex" }}>fraccion.si · Seguimiento de portafolios</div>
          <div style={{ display: "flex" }}>Información pública, no asesoría</div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}