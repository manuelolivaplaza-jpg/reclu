import { ImageResponse } from "next/og";
import { getPortfolioBySlug } from "@/lib/queries";
import { CATEGORY_META } from "@/lib/types";

export const alt = "Portafolio en fraccion.si";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface OGProps {
  params: Promise<{ slug: string }>;
}

/** Misma regla que queries.ts: sin Supabase real, los datos son ilustrativos. */
function isSupabaseLive(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.startsWith("https://") && !url.includes("placeholder");
}

/**
 * OG por portafolio — mismo lenguaje visual que la ficha: fondo negro,
 * filetes 1px #262626, wordmark en minúsculas y el retorno en verde/rojo
 * solo en la cifra. Sin holdings (muro de pago): nombre, categoría, país y,
 * si existe, el retorno YTD real.
 */
export default async function OpenGraphImage({ params }: OGProps) {
  const { slug } = await params;
  const portfolio = await getPortfolioBySlug(slug);

  const name = String(portfolio?.name ?? "").trim() || "Portafolio";
  const category = portfolio ? (CATEGORY_META[portfolio.category]?.label ?? "") : "";
  const country =
    portfolio?.country === "CL" ? "CL" : portfolio?.country === "US" ? "US" : "Global";
  const meta = [category, country].filter((part) => part.trim().length > 0).join(" · ");

  // La cifra solo se pinta si es un número finito: nunca "NaN%" ni un 0 de relleno.
  const raw = portfolio?.return_ytd;
  const ytd =
    raw === null || raw === undefined || !Number.isFinite(Number(raw)) ? null : Number(raw);
  // En modo demo el retorno es ilustrativo: no se pinta como si fuera real.
  const hasReturn = ytd !== null && isSupabaseLive();
  const positive = ytd !== null && ytd >= 0;
  const returnLabel =
    ytd === null
      ? ""
      : `${ytd > 0 ? "+" : ytd < 0 ? "−" : ""}${Math.abs(ytd).toLocaleString("es-CL", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}%`;

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
              fontSize: "18px",
              color: "#8a8a8a",
            }}
          >
            {meta}
          </div>
        </div>

        {/* Center: nombre + retorno */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            maxWidth: "980px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "56px",
              fontWeight: 500,
              lineHeight: 1.04,
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
                  fontSize: "40px",
                  fontWeight: 500,
                  letterSpacing: "-0.03em",
                  color: positive ? "#4ade80" : "#f87171",
                }}
              >
                {returnLabel}
              </span>
              <span
                style={{
                  display: "flex",
                  fontSize: "18px",
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
