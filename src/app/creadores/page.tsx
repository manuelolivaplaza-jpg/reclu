import { withSeo } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalNotice } from "@/components/legal/legal-notice";
import { communityEnabled } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/app";

export const metadata: Metadata = withSeo("/creadores", {
  title: "Creadores",
  description:
    "Carteras publicadas por creadores de la comunidad de fraccion.si. Contenido informativo de terceros, no asesoría de inversión.",
});

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
  const hasData = !loadError && creators.length > 0;

  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1 bg-white dark:bg-ink-950">
        <div className="container-page pb-24 pt-10 md:pt-14">
          <header className="border-b border-ink-300 pb-8 dark:border-white/12">
            <p className="label-line">Comunidad</p>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-x-12 gap-y-8">
              <div className="max-w-2xl">
                <h1 className="type-section text-ink-900 dark:text-white">Creadores.</h1>
                <p className="type-body mt-5">
                  Carteras que personas de la comunidad deciden compartir en público. Cada perfil pasa por
                  moderación antes de aparecer aquí.
                </p>
              </div>
              {hasData ? (
                <dl className="flex shrink-0 items-end gap-10">
                  <div>
                    <dt className="label-line">Creadores verificados</dt>
                    <dd className="num mt-2 text-[28px] leading-none text-ink-900 dark:text-white">{creators.length}</dd>
                  </div>
                  <div>
                    <dt className="label-line">Carteras publicadas</dt>
                    <dd className="num mt-2 text-[28px] leading-none text-ink-900 dark:text-white">{totalCarteras}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
          </header>

          <div className="mt-8 flex flex-col gap-2 border border-ink-900 p-4 dark:border-white/40 sm:flex-row sm:items-baseline sm:gap-4 sm:p-5">
            <p className="shrink-0 text-[13px] font-medium text-ink-900 dark:text-white">Contenido de terceros, no asesoría.</p>
            <p className="text-[13px] leading-relaxed text-ink-600 dark:text-ink-400">
              Las carteras las publica cada creador y reflejan su opinión, no una recomendación de
              fraccion.si. No ejecutamos órdenes ni damos asesoría de inversión personalizada.
            </p>
          </div>

          {loadError ? (
            <p role="alert" className="mt-8 border border-ink-900 px-4 py-3 text-[14px] text-ink-900 dark:border-white/40 dark:text-white">
              {loadError}
            </p>
          ) : null}

          {!loadError && creators.length === 0 ? (
            <div className="mt-10 border border-ink-300 px-6 py-16 text-center dark:border-white/12">
              <p className="text-[22px] font-medium tracking-[-0.03em] text-ink-900 dark:text-white">Aún no hay creadores</p>
              <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ink-600 dark:text-ink-400">
                Todavía no hay creadores verificados con carteras publicadas.
              </p>
            </div>
          ) : null}

          {creators.length > 0 ? (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {creators.map((creator) => (
                <li key={creator.id}>
                  <Link
                    href={`/creadores/${creator.alias}`}
                    className="group flex h-full flex-col gap-4 border border-ink-300 bg-white p-5 transition-colors hover:border-ink-900 dark:border-white/12 dark:bg-ink-950 dark:hover:border-white"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={creator.alias} className="size-10 rounded-none bg-ink-900 text-[13px] text-white dark:bg-white dark:text-ink-950" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[15px] font-medium text-ink-900 dark:text-white">{creator.alias}</p>
                        <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">✓ Verificado por moderación</p>
                      </div>
                      <span aria-hidden className="text-ink-400 transition-transform group-hover:translate-x-0.5 dark:text-ink-500">→</span>
                    </div>
                    <p className="line-clamp-3 text-[14px] leading-relaxed text-ink-600 dark:text-ink-400">
                      {creator.bio || "Perfil verificado de la comunidad, sin bio pública."}
                    </p>
                    <div className="mt-auto flex flex-wrap items-center gap-2">
                      <span className="border border-ink-300 px-2 py-0.5 text-[11px] text-ink-600 dark:border-white/12 dark:text-ink-400">
                        {creator.carteras} {creator.carteras === 1 ? "cartera" : "carteras"}
                      </span>
                      {creator.conflictoInteres ? (
                        <span className="border border-ink-900 px-2 py-0.5 text-[11px] text-ink-900 dark:border-white/40 dark:text-white">
                          Conflicto de interés declarado
                        </span>
                      ) : null}
                    </div>
                    {creator.conflictoInteres ? (
                      <p className="text-[12px] leading-relaxed text-ink-500 dark:text-ink-400">{creator.conflictoInteres}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-16 max-w-3xl">
            <LegalNotice kind="fintec" />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
