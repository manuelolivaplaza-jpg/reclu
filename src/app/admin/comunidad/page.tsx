import type { Metadata } from "next";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { SiteHeader } from "@/components/site-header";
import { containsAdviceImperative, communityEnabled } from "@/lib/community";
import { createAdminClient } from "@/lib/supabase/admin";
import { PortfolioModerationForms, VerifyCreatorForm } from "./moderacion-forms";

export const metadata: Metadata = {
  title: "Comunidad",
  robots: { index: false, follow: false },
};

// Lee la sesión y las propuestas por request; nunca se prerenderiza.
export const instant = false;

interface CreatorSummary {
  id: string;
  alias: string;
  verificado: boolean;
  conflicto_interes: string | null;
}

interface PendingPortfolio {
  id: string;
  creator_id: string;
  titulo: string;
  descripcion: string;
  holdings: unknown;
  created_at: string;
  creator: CreatorSummary | null;
}

interface UnverifiedProfile {
  id: string;
  alias: string;
  conflicto_interes: string | null;
  created_at: string;
}

function normalizeCreator(
  value: unknown,
): CreatorSummary | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const candidate = row as Record<string, unknown>;
  if (typeof candidate.id !== "string" || typeof candidate.alias !== "string") {
    return null;
  }
  return {
    id: candidate.id,
    alias: candidate.alias,
    verificado: candidate.verificado === true,
    conflicto_interes:
      typeof candidate.conflicto_interes === "string"
        ? candidate.conflicto_interes
        : null,
  };
}

function holdingLabels(holdings: unknown): string[] {
  if (!Array.isArray(holdings)) return [];
  return holdings.map((entry) => {
    if (!entry || typeof entry !== "object") return "";
    const holding = entry as Record<string, unknown>;
    const symbol =
      typeof holding.symbol === "string" ? holding.symbol.trim() : "";
    const weight =
      typeof holding.weight === "number" && Number.isFinite(holding.weight)
        ? `${holding.weight}%`
        : "";
    return [symbol, weight].filter(Boolean).join(" ");
  });
}

function hasAdviceWarning(portfolio: PendingPortfolio): boolean {
  const texts = [
    portfolio.titulo,
    portfolio.descripcion,
    ...holdingLabels(portfolio.holdings).map((label) => label),
  ];
  return texts.some((text) => containsAdviceImperative(text));
}

export default async function ComunidadPage() {
  await connection();
  await requireAdmin();

  // Sin el flag, la ruta no existe: la comunidad entera está apagada.
  if (!communityEnabled()) {
    notFound();
  }

  const supabase = createAdminClient();

  let pending: PendingPortfolio[] = [];
  let unverified: UnverifiedProfile[] = [];
  let loadError: string | null = null;

  if (!supabase) {
    loadError =
      "Supabase no está configurado. Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.";
  } else {
    const [portfoliosResult, profilesResult] = await Promise.all([
      supabase
        .from("creator_portfolios")
        .select(
          "id, creator_id, titulo, descripcion, holdings, created_at, creator_profiles ( id, alias, verificado, conflicto_interes )",
        )
        .eq("estado", "pending")
        .order("created_at", { ascending: true })
        .limit(200),
      supabase
        .from("creator_profiles")
        .select("id, alias, conflicto_interes, created_at")
        .eq("verificado", false)
        .order("created_at", { ascending: true })
        .limit(200),
    ]);

    if (portfoliosResult.error) {
      loadError = `No se pudieron leer las propuestas: ${portfoliosResult.error.message}`;
    } else {
      pending = (portfoliosResult.data ?? []).map((row) => {
        const record = row as Record<string, unknown>;
        return {
          id: String(record.id),
          creator_id: String(record.creator_id),
          titulo: String(record.titulo ?? ""),
          descripcion: String(record.descripcion ?? ""),
          holdings: record.holdings,
          created_at: String(record.created_at ?? ""),
          creator: normalizeCreator(record.creator_profiles),
        };
      });
    }

    if (profilesResult.error && !loadError) {
      loadError = `No se pudieron leer los perfiles: ${profilesResult.error.message}`;
    } else {
      unverified = (profilesResult.data ?? []) as UnverifiedProfile[];
    }
  }

  const advisedCount = pending.filter(hasAdviceWarning).length;

  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page flex-1 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink-200 pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-ink-500">
              Administración
            </p>
            <h1 className="mt-2 text-3xl font-medium tracking-tight text-ink-900">
              Comunidad
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">
              Carteras propuestas por creadores, pendientes de moderación. La
              comunidad es informativa: no se publican recomendaciones ni
              instrucciones de compra o venta.
            </p>
          </div>
          <dl className="flex flex-wrap gap-3 text-xs">
            <div className="border border-ink-200 px-3 py-2">
              <dt className="uppercase tracking-[0.08em] text-ink-500">
                Pendientes
              </dt>
              <dd className="mt-1 font-medium text-ink-900">{pending.length}</dd>
            </div>
            <div className="border border-ink-200 px-3 py-2">
              <dt className="uppercase tracking-[0.08em] text-ink-500">
                Posible asesoría
              </dt>
              <dd className="mt-1 font-medium text-ink-900">{advisedCount}</dd>
            </div>
            <div className="border border-ink-200 px-3 py-2">
              <dt className="uppercase tracking-[0.08em] text-ink-500">
                Sin verificar
              </dt>
              <dd className="mt-1 font-medium text-ink-900">
                {unverified.length}
              </dd>
            </div>
          </dl>
        </div>

        <p className="mt-6 max-w-3xl border border-ink-200 p-4 text-xs leading-relaxed text-ink-500">
          Aprobar publica la cartera con los datos declarados por el creador.
          Antes de encender la comunidad hace falta revisión legal (Ley Fintec
          21.521): revisa conflicto de interés, lenguaje imperativo y que el
          contenido sea informativo.
        </p>

        {loadError && (
          <p
            role="alert"
            className="mt-6 border border-ink-200 p-4 text-sm text-ink-900"
          >
            {loadError}
          </p>
        )}

        <section aria-labelledby="pendientes" className="mt-10">
          <div className="flex items-baseline justify-between gap-3 border-b border-ink-200 pb-2">
            <h2
              id="pendientes"
              className="text-lg font-medium text-ink-900"
            >
              Propuestas pendientes
            </h2>
            <span className="text-xs text-ink-500">{pending.length}</span>
          </div>

          {!loadError && pending.length === 0 && (
            <p className="mt-4 text-sm text-ink-500">
              No hay propuestas pendientes.
            </p>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {pending.map((portfolio) => {
              const warned = hasAdviceWarning(portfolio);
              const creator = portfolio.creator;
              return (
                <article
                  key={portfolio.id}
                  className="flex flex-col border border-ink-200 bg-white"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ink-200 p-4">
                    <div>
                      <p className="text-sm font-medium text-ink-900">
                        {portfolio.titulo}
                      </p>
                      <p className="mt-1 text-xs text-ink-500">
                        Creador:{" "}
                        <span className="font-mono">
                          {creator?.alias ?? portfolio.creator_id}
                        </span>
                        {creator
                          ? creator.verificado
                            ? " · verificado"
                            : " · sin verificar"
                          : ""}
                      </p>
                    </div>
                    <p className="text-right text-xs text-ink-500">
                      {portfolio.created_at
                        ? new Date(portfolio.created_at).toLocaleString("es-CL")
                        : ""}
                      <br />
                      <span className="font-mono">{portfolio.id}</span>
                    </p>
                  </div>

                  <div className="flex-1 p-4">
                    {portfolio.descripcion && (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-900">
                        {portfolio.descripcion}
                      </p>
                    )}

                    <p className="mt-4 text-xs uppercase tracking-[0.08em] text-ink-500">
                      Posiciones
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-2 text-xs text-ink-900">
                      {holdingLabels(portfolio.holdings).map((label, index) => (
                        <li
                          key={`${portfolio.id}-${index}`}
                          className="border border-ink-200 px-2 py-1 font-mono"
                        >
                          {label}
                        </li>
                      ))}
                    </ul>

                    <p className="mt-4 text-xs uppercase tracking-[0.08em] text-ink-500">
                      Conflicto de interés declarado
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-900">
                      {creator?.conflicto_interes?.trim()
                        ? creator.conflicto_interes
                        : "Sin declarar."}
                    </p>

                    {warned && (
                      <p
                        role="alert"
                        className="mt-4 border border-ink-900 p-3 text-xs leading-relaxed text-ink-900"
                      >
                        Aviso: el texto parece incluir una instrucción de
                        inversión ("compra ya", "vende ahora"...). La comunidad
                        no publica asesoría: rechaza o pide una corrección.
                      </p>
                    )}
                  </div>

                  <div className="border-t border-ink-200 p-4">
                    <PortfolioModerationForms id={portfolio.id} />
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="perfiles" className="mt-12">
          <div className="flex items-baseline justify-between gap-3 border-b border-ink-200 pb-2">
            <h2 id="perfiles" className="text-lg font-medium text-ink-900">
              Perfiles sin verificar
            </h2>
            <span className="text-xs text-ink-500">{unverified.length}</span>
          </div>

          {!loadError && unverified.length === 0 && (
            <p className="mt-4 text-sm text-ink-500">
              No hay perfiles sin verificar.
            </p>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {unverified.map((profile) => (
              <article
                key={profile.id}
                className="flex flex-wrap items-start justify-between gap-4 border border-ink-200 bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm text-ink-900">
                    {profile.alias}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    Conflicto de interés:{" "}
                    {profile.conflicto_interes?.trim()
                      ? profile.conflicto_interes
                      : "sin declarar"}
                  </p>
                </div>
                <VerifyCreatorForm id={profile.id} alias={profile.alias} />
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
