import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalNotice } from "@/components/legal/legal-notice";
import { communityEnabled } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Chip, StatCard } from "@/components/app";

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

  const totalCarteras = creators.reduce((s, c) => s + c.carteras, 0);

  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1 bg-app-canvas">
        <div className="mx-auto w-full max-w-[1120px] px-4 pb-20 pt-6 sm:px-6 md:px-10 md:pt-12">
          <section className="app-card p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="info">Comunidad</Chip>
              <Chip>Moderado</Chip>
            </div>
            <h1 className="mt-3 text-app-display font-semibold tracking-tight text-ink-900">Creadores</h1>
            <p className="mt-2 max-w-2xl text-app-body text-ink-600">
              Carteras que personas de la comunidad deciden compartir en público. Cada perfil pasa por moderación antes de aparecer aquí.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-md">
              <StatCard label="Creadores verificados" value={loadError ? null : String(creators.length)} />
              <StatCard label="Carteras publicadas" value={loadError ? null : String(totalCarteras)} />
            </div>
          </section>

          <div className="mt-4 rounded-2xl border border-ink-900/80 bg-app-card px-4 py-3 text-[13px] leading-relaxed text-ink-900">
            <strong className="font-semibold">Contenido de terceros, no asesoría.</strong> Las carteras las publica cada creador y reflejan su
            opinión, no una recomendación de reclu.cl. No ejecutamos órdenes ni damos asesoría de inversión personalizada.
          </div>

          {loadError && (
            <p role="alert" className="app-card mt-4 p-4 text-sm text-ink-900">
              {loadError}
            </p>
          )}

          {!loadError && creators.length === 0 && (
            <div className="app-card mt-4 p-8 text-center">
              <p className="text-app-title font-semibold text-ink-900">Aún no hay creadores</p>
              <p className="mt-1 text-app-caption text-ink-500">Todavía no hay creadores verificados con carteras publicadas.</p>
            </div>
          )}

          {creators.length > 0 && (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {creators.map((creator) => (
                <li key={creator.id}>
                  <Link
                    href={`/creadores/${creator.alias}`}
                    className="app-card group flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-app-raised sm:p-5"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={creator.alias} className="size-11 rounded-2xl text-[14px]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[16px] font-semibold text-ink-900">{creator.alias}</p>
                        <p className="text-app-caption text-positive">✓ Verificado</p>
                      </div>
                      <span aria-hidden className="text-ink-400 transition-transform group-hover:translate-x-0.5">→</span>
                    </div>
                    <p className="line-clamp-3 text-[14px] leading-relaxed text-ink-600">
                      {creator.bio || "Perfil verificado de la comunidad, sin bio pública."}
                    </p>
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Chip>
                        {creator.carteras} {creator.carteras === 1 ? "cartera" : "carteras"}
                      </Chip>
                      {creator.conflictoInteres && <Chip tone="sell">Conflicto de interés declarado</Chip>}
                    </div>
                    {creator.conflictoInteres && (
                      <p className="text-app-caption leading-relaxed text-ink-500">{creator.conflictoInteres}</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8 max-w-3xl">
            <LegalNotice kind="fintec" />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
