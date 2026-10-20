import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalNotice } from "@/components/legal/legal-notice";
import { communityEnabled } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Creadores",
  description:
    "Carteras publicadas por creadores de la comunidad de reclu.cl. Contenido informativo de terceros, no asesoría de inversión.",
};

// Lee la bandera COMMUNITY_ENABLED y Supabase por request; nunca se prerenderiza.
export const instant = false;

interface CreatorSummary {
  id: string;
  alias: string;
  bio: string;
  conflictoInteres: string | null;
  carteras: number;
}

interface PortfolioRow {
  creatorId: string;
  created_at: string;
  creator: {
    id: string;
    alias: string;
    bio: string;
    verificado: boolean;
    conflicto_interes: string | null;
  } | null;
}

/** El join de Supabase puede llegar como objeto o como array de una fila. */
function normalizeCreator(value: unknown): PortfolioRow["creator"] {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const candidate = row as Record<string, unknown>;
  if (typeof candidate.id !== "string" || typeof candidate.alias !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    alias: candidate.alias,
    bio: typeof candidate.bio === "string" ? candidate.bio : "",
    verificado: candidate.verificado === true,
    conflicto_interes:
      typeof candidate.conflicto_interes === "string" &&
      candidate.conflicto_interes.trim()
        ? candidate.conflicto_interes
        : null,
  };
}

/**
 * Agrupa las carteras aprobadas por creador. Solo aparecen perfiles
 * verificados: la política pública de RLS ya los exige, pero se comprueba
 * también aquí para no publicar nada si la consulta cambia de forma.
 */
function groupCreators(rows: unknown[]): CreatorSummary[] {
  const map = new Map<string, CreatorSummary>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const creator = normalizeCreator(record.creator_profiles);
    if (!creator || !creator.verificado) continue;
    const existing = map.get(creator.id);
    if (existing) {
      existing.carteras += 1;
      continue;
    }
    map.set(creator.id, {
      id: creator.id,
      alias: creator.alias,
      bio: creator.bio,
      conflictoInteres: creator.conflicto_interes,
      carteras: 1,
    });
  }
  return [...map.values()].sort((a, b) => a.alias.localeCompare(b.alias, "es"));
}

export default async function CreadoresPage() {
  await connection();

  // Sin la bandera, la comunidad entera no existe para el público.
  if (!communityEnabled()) {
    notFound();
  }

  const supabase = await createClient();

  let creators: CreatorSummary[] = [];
  let loadError: string | null = null;

  try {
    const { data, error } = await supabase
      .from("creator_portfolios")
      .select(
        "creator_id, created_at, creator_profiles ( id, alias, bio, verificado, conflicto_interes )",
      )
      .eq("estado", "approved")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      loadError =
        "No pudimos cargar los creadores ahora mismo. Vuelve a intentarlo en unos minutos.";
    } else {
      creators = groupCreators((data ?? []) as unknown[]);
    }
  } catch {
    loadError =
      "No pudimos cargar los creadores ahora mismo. Vuelve a intentarlo en unos minutos.";
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <div className="container-page py-16 md:py-20">
          <p className="text-xs uppercase tracking-[0.12em] text-ink-500">
            Comunidad
          </p>
          <h1 className="type-section mt-3 text-ink-900">Creadores.</h1>
          <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-ink-500">
            Carteras que personas de la comunidad deciden compartir en
            público. Cada perfil pasa por moderación antes de aparecer aquí.
          </p>

          <div className="mt-8 max-w-3xl border border-ink-900 px-4 py-3 text-[12px] leading-relaxed text-ink-900">
            <strong className="font-medium">
              Contenido de terceros, no asesoría.
            </strong>{" "}
            Las carteras las publica cada creador y reflejan su opinión, no una
            recomendación de reclu.cl. No ejecutamos órdenes ni damos asesoría
            de inversión personalizada.
          </div>

          {loadError && (
            <p
              role="alert"
              className="mt-8 max-w-3xl border border-ink-200 p-4 text-sm text-ink-900"
            >
              {loadError}
            </p>
          )}

          {!loadError && creators.length === 0 && (
            <p className="mt-12 max-w-2xl text-[15px] text-ink-500">
              Todavía no hay creadores verificados con carteras publicadas.
            </p>
          )}

          {creators.length > 0 && (
            <ul className="mt-12 border-b border-ink-200">
              {creators.map((creator) => (
                <li key={creator.id} className="border-t border-ink-200">
                  <Link
                    href={`/creadores/${creator.alias}`}
                    className="group grid gap-3 py-7 md:grid-cols-[1fr_auto] md:items-baseline md:gap-8"
                  >
                    <div className="min-w-0">
                      <h2 className="font-mono text-[20px] font-medium tracking-[-0.02em] text-ink-900 group-hover:underline">
                        {creator.alias}
                      </h2>
                      <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-500">
                        {creator.bio ||
                          "Perfil verificado de la comunidad, sin bio pública."}
                      </p>
                      {creator.conflictoInteres && (
                        <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-ink-500">
                          Conflicto de interés declarado:{" "}
                          {creator.conflictoInteres}
                        </p>
                      )}
                    </div>
                    <span className="text-[12px] uppercase tracking-[0.08em] text-ink-500">
                      {creator.carteras}{" "}
                      {creator.carteras === 1 ? "cartera" : "carteras"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-12 max-w-3xl">
            <LegalNotice kind="fintec" />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
