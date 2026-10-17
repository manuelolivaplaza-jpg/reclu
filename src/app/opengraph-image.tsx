import { ImageResponse } from "next/og";

export const alt = "reclu.cl — Sigue las carteras que mueven el mercado";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FEATURED_RETURNS = [
  { name: "Pelosi Tracker", returnYtd: "+31.4%" },
  { name: "Trump Radar", returnYtd: "+36.4%" },
  { name: "Duquesne 13F", returnYtd: "+34.6%" },
  { name: "Renta 4", returnYtd: "+12.6%" },
];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0a0a0a",
          color: "#ffffff",
          padding: "56px 64px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            borderBottom: "1px solid #262626",
            paddingBottom: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              fontSize: "28px",
              fontWeight: 600,
              letterSpacing: "-0.04em",
              color: "#ffffff",
            }}
          >
            reclu
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "14px",
              letterSpacing: "0.08em",
              color: "#8a8a8a",
            }}
          >
            CL · US · 13F
          </div>
        </div>

        {/* Center copy */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            maxWidth: "960px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "76px",
              fontWeight: 500,
              lineHeight: 0.96,
              letterSpacing: "-0.045em",
              color: "#ffffff",
            }}
          >
            Sigue las carteras que mueven el mercado.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "24px",
              fontWeight: 400,
              lineHeight: 1.4,
              color: "#9a9a9a",
            }}
          >
            Políticos de EE.UU., corredoras chilenas y fondos 13F. Alertas con IA.
          </div>
        </div>

        {/* Bottom strip */}
        <div
          style={{
            display: "flex",
            width: "100%",
            borderTop: "1px solid #262626",
            borderBottom: "1px solid #262626",
          }}
        >
          {FEATURED_RETURNS.map((item, idx) => (
            <div
              key={item.name}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                padding: "20px 24px",
                paddingLeft: idx === 0 ? "0px" : "24px",
                borderLeft: idx === 0 ? "none" : "1px solid #262626",
                gap: "6px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: "15px",
                  color: "#8a8a8a",
                }}
              >
                {item.name}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: "32px",
                  fontWeight: 500,
                  letterSpacing: "-0.03em",
                  color: "#22c55e",
                }}
              >
                {item.returnYtd}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
