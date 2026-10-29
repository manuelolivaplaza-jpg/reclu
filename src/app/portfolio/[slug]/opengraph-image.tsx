import { ImageResponse } from "next/og";
import { getPortfolioBySlug } from "@/lib/queries";

export const alt = "Portafolio en fraccion.si";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface OGProps {
  params: Promise<{ slug: string }>;
}

/**
 * OG por portafolio — mismo lenguaje visual que la home: monolito negro,
 * filetes 1px #262626, retorno en verde/rojo solo en la cifra.
 * Sin datos de holdings (muro de pago): solo nombre, categoría y retorno.
 */
export default async function OpenGraphImage({ params }: OGProps) {
  const { slug } = await params;
  const portfolio = await getPortfolioBySlug(slug);

  const name = portfolio?.name ?? "Portafolio";
  const meta =
    portfolio?.country === "CL"
      ? "Chile"
      : portfolio?.country === "US"
        ? "EE.UU."
        : "Global";
  const hasReturn = portfolio?.return_ytd !== null && portfolio?.return_ytd !== undefined;
  const positive = (portfolio?.return_ytd ?? 0) >= 0;
  const sign = positive ? "+" : "";

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
            fraccion
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "14px",
              letterSpacing: "0.08em",
              color: "#8a8a8a",
            }}
          >
            PORTAFOLIO · {meta.toUpperCase()}
          </div>
        </div>

        {/* Center: nombre + retorno */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            maxWidth: "960px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "64px",
              fontWeight: 500,
              lineHeight: 1.02,
              letterSpacing: "-0.045em",
              color: "#ffffff",
            }}
          >
            {name}
          </div>
          {hasReturn && (
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "16px",
              }}
            >
              <span
                style={{
                  display: "flex",
                  fontSize: "44px",
                  fontWeight: 500,
                  letterSpacing: "-0.03em",
                  color: positive ? "#22c55e" : "#ef4444",
                }}
              >
                {sign}
                {portfolio?.return_ytd?.toFixed(1)}%
              </span>
              <span
                style={{
                  display: "flex",
                  fontSize: "20px",
                  color: "#8a8a8a",
                }}
              >
                retorno YTD
              </span>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            borderTop: "1px solid #262626",
            paddingTop: "24px",
            fontSize: "16px",
            color: "#8a8a8a",
          }}
        >
          <div style={{ display: "flex" }}>fraccion.si · Seguimiento de portafolios</div>
          <div style={{ display: "flex" }}>Información pública, no asesoría</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
