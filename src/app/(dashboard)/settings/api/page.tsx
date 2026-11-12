import { connection } from "next/server";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import {
  API_MAX_ACTIVE_KEYS,
  activeApiKeyLimitReached,
  apiDailyLimit,
  apiPublicEnabled,
  generateApiKey,
  normalizeApiPlan,
  rateLimitHeaders,
  rateLimit,
  apiDayKey,
  type ApiKeyFormState,
} from "@/lib/api-keys";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { ApiKeysPanel, type ApiKeyListItem } from "@/components/api-keys-panel";
import { LegalNotice } from "@/components/legal/legal-notice";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { referralsEnabled } from "@/lib/referrals";

export const metadata = {
  title: "Claves de API",
  description:
    "Claves personales para consultar los datos públicos de Fraccion desde tus propios sistemas.",
};
// Ruta protegida por auth: lee cookies por request — nunca se prerenderiza.
export const instant = false;

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  plan: string;
  revoked: boolean;
  created_at: string;
  last_used_at: string | null;
}

function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin registro";
  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Crea una clave. El server action devuelve la clave en claro UNA vez, en
 * la respuesta de esta acción: no se guarda, no se loguea y no se revalida
 * a ningún sitio que la pueda releer.
 */
async function createApiKeyAction(
  _prev: ApiKeyFormState,
  formData: FormData,
): Promise<ApiKeyFormState> {
  "use server";

  if (!apiPublicEnabled()) {
    return { error: "La API pública todavía no está habilitada." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  const plan = normalizeApiPlan(profile?.plan);

  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim().slice(0, 60) : "";

  const service = getServiceClient();
  if (!service) {
    return { error: "La API todavía no está configurada. Inténtalo más tarde." };
  }

  // El tope se valida en el servidor: la UI puede mostrar el aviso, pero la
  // decisión no depende del navegador. Las revocadas no ocupan cupo.
  const { count, error: countError } = await service
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("revoked", false);
  if (countError) {
    console.warn("[reclu] api_keys count:", countError.message);
    return { error: "No pudimos crear la clave. Inténtalo de nuevo." };
  }
  if (activeApiKeyLimitReached(count ?? 0)) {
    return {
      error: `Puedes tener hasta ${API_MAX_ACTIVE_KEYS} claves activas. Revoca una antes de crear otra.`,
    };
  }

  const generated = generateApiKey();
  const { error } = await service.from("api_keys").insert({
    user_id: user.id,
    name: name || "Clave sin nombre",
    prefix: generated.prefix,
    key_hash: generated.hash,
    plan,
  });
  if (error) {
    return { error: "No pudimos crear la clave. Inténtalo de nuevo." };
  }

  revalidatePath("/settings/api");
  return {
    success: "Clave creada. Guárdala ahora: no volveremos a mostrarla.",
    key: generated.plaintext,
  };
}

/** Revoca una clave propia. La fila no se borra: queda la constancia. */
async function revokeApiKeyAction(
  _prev: ApiKeyFormState,
  formData: FormData,
): Promise<ApiKeyFormState> {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const id = formData.get("id");
  if (typeof id !== "string" || id.length < 10 || id.length > 64) {
    return { error: "Clave inválida." };
  }

  const service = getServiceClient();
  if (!service) {
    return { error: "La API todavía no está configurada. Inténtalo más tarde." };
  }

  // `user_id` en el WHERE: nadie revoca claves ajenas ni adivinando el id.
  const { error } = await service
    .from("api_keys")
    .update({ revoked: true, revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "No pudimos revocar la clave. Inténtalo de nuevo." };

  revalidatePath("/settings/api");
  return { success: "Clave revocada. Sus llamadas dejan de responder de inmediato." };
}

export default async function ApiSettingsPage() {
  // Marca la ruta como dinámica (lee cookies de auth) bajo cacheComponents.
  await connection();
  const profile = await getProfile();
  if (!profile) {
    return (
      <div className="flex max-w-xl flex-col gap-4 pb-8">
        <h1 className="text-[32px] font-medium leading-[1.03] tracking-[-0.04em] text-ink-900 sm:text-[40px]">
          Claves de API
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-500">
          No pudimos cargar tu perfil. Vuelve a intentarlo en unos minutos.
        </p>
        <ButtonLink href="/settings/api" variant="outline" size="sm" className="w-fit">
          Reintentar
        </ButtonLink>
      </div>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, prefix, plan, revoked, created_at, last_used_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[reclu] api_keys:", error.message);
  }
  const keysUnavailable = Boolean(error);

  const keys: ApiKeyListItem[] = ((data ?? []) as ApiKeyRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    plan: row.plan,
    revoked: row.revoked,
    createdAt: formatDay(row.created_at),
    // Sin uso todavía: `null` para que el panel lo rotule "Sin uso".
    lastUsedAt: row.last_used_at ? formatDay(row.last_used_at) : null,
  }));

  const enabled = apiPublicEnabled();
  const plan = normalizeApiPlan(profile.plan);
  const dailyLimit = apiDailyLimit(plan);
  const limitText = dailyLimit.toLocaleString("es-CL");
  const apiPlanLabel = plan === "elite" ? "Elite" : plan === "pro" ? "Pro" : "Gratis";
  const activeKeys = keys.filter((key) => !key.revoked).length;
  const activeKeysLabel = `${activeKeys} de ${API_MAX_ACTIVE_KEYS}`;
  const atKeyLimit = activeApiKeyLimitReached(activeKeys);

  // Cabeceras que verá cada respuesta: se documentan también en la UI para
  // que quien integra sepa cuándo se acerca al tope (sin exponer la clave).
  const headersPreview = rateLimitHeaders(
    rateLimit({ plan, used: 0, day: apiDayKey(), today: apiDayKey() }),
  );

  return (
    <div className="flex flex-col gap-8 pb-8">
      <header className="flex flex-col gap-4 border-b border-line pb-6">
        <Link
          href="/settings"
          className="inline-flex w-fit items-center gap-1.5 text-[13px] text-ink-500 transition-colors hover:text-ink-900"
        >
          <span aria-hidden="true">←</span>
          Volver a Ajustes
        </Link>
        <div>
          <p className="label-line">Integraciones</p>
          <h1 className="mt-3 text-[32px] font-medium leading-[1.03] tracking-[-0.04em] text-ink-900 sm:text-[40px]">
            Claves de API
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-500">
            Consulta los datos públicos de Fraccion desde tus propios sistemas con
            una clave personal. La clave se muestra una sola vez: guárdala al crearla.
          </p>
        </div>
      </header>

      {/* Resumen de acceso: plan, cuota y claves vivas */}
      <section aria-labelledby="resumen-acceso" className="flex flex-col gap-3">
        <h2 id="resumen-acceso" className="label-line">
          Resumen de acceso
        </h2>
        <dl className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 bg-app-card p-4 sm:p-5">
            <dt className="label-line">Plan de la API</dt>
            <dd className="flex flex-col gap-0.5">
              <span className="text-[15px] leading-snug text-ink-900">{apiPlanLabel}</span>
              <span className="text-[13px] leading-snug text-ink-500">
                Según el plan de tu cuenta
              </span>
            </dd>
          </div>
          <div className="flex flex-col gap-1.5 bg-app-card p-4 sm:p-5">
            <dt className="label-line">Cuota diaria</dt>
            <dd className="flex flex-col gap-0.5">
              <span className="num text-[15px] leading-snug text-ink-900">
                {limitText} llamadas
              </span>
              <span className="text-[13px] leading-snug text-ink-500">
                Por clave y por día (UTC)
              </span>
            </dd>
          </div>
          <div className="flex flex-col gap-1.5 bg-app-card p-4 sm:p-5">
            <dt className="label-line">Claves activas</dt>
            <dd className="flex flex-col gap-0.5">
              <span className="num text-[15px] leading-snug text-ink-900">
                {keysUnavailable ? "Sin dato" : activeKeysLabel}
              </span>
              <span className="text-[13px] leading-snug text-ink-500">
                {keysUnavailable
                  ? "No pudimos leer tus claves"
                  : atKeyLimit
                    ? "Tope alcanzado: revoca una antes de crear otra"
                    : `Puedes tener hasta ${API_MAX_ACTIVE_KEYS} claves activas a la vez`}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      {!enabled && (
        <div className="border border-line px-4 py-3">
          <p className="text-[13px] leading-relaxed text-ink-500">
            La API pública todavía no está habilitada. Puedes revocar claves
            existentes, pero crear una nueva y llamar a la API quedará disponible
            cuando la activemos.
          </p>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] xl:gap-12">
        <SettingsSubnav showReferrals={referralsEnabled()} />

        <div className="flex min-w-0 max-w-4xl flex-col gap-8">
          {keysUnavailable ? (
            <Card>
              <div className="flex flex-col gap-3 p-5 sm:p-6">
                <h2 className="text-[17px] font-medium leading-snug tracking-[-0.02em] text-ink-900">
                  No pudimos cargar tus claves
                </h2>
                <p className="max-w-xl text-[13px] leading-relaxed text-ink-500">
                  La lista de claves no está disponible en este momento. No crees ni
                  revoques claves hasta poder verlas: vuelve a intentarlo en unos
                  minutos.
                </p>
                <ButtonLink
                  href="/settings/api"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                >
                  Reintentar
                </ButtonLink>
              </div>
            </Card>
          ) : (
            <Card>
              <div className="p-5 sm:p-6">
                <ApiKeysPanel
                  enabled={enabled}
                  keys={keys}
                  limitText={limitText}
                  createAction={createApiKeyAction}
                  revokeAction={revokeApiKeyAction}
                  headersPreview={headersPreview}
                />
              </div>
            </Card>
          )}

          <div className="flex flex-col gap-4">
            <LegalNotice kind="us_disclosure" />
            <p className="text-[13px] leading-relaxed text-ink-500">
              La API entrega información pública agregada. No redistribuye las
              declaraciones patrimoniales ni entrega las posiciones completas de
              fondos, ETF y políticos: en fraccion.si esas posiciones son para
              suscriptores. Tampoco ejecuta órdenes ni entrega recomendaciones
              personalizadas.
            </p>
            <p className="text-[13px]">
              <Link
                href="/api-docs"
                className="text-ink-900 underline underline-offset-4 hover:opacity-60"
              >
                Ver documentación de la API
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
