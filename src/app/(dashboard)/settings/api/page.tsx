import { connection } from "next/server";
import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import {
  apiDailyLimit,
  apiPublicEnabled,
  generateApiKey,
  normalizeApiPlan,
  rateLimitHeaders,
  rateLimit,
  apiDayKey,
  type ApiKeyFormState,
} from "@/lib/api-keys";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ApiKeysPanel, type ApiKeyListItem } from "@/components/api-keys-panel";
import { LegalNotice } from "@/components/legal/legal-notice";

export const metadata = { title: "API" };
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
  if (Number.isNaN(date.getTime())) return "—";
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
  if (!profile) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, prefix, plan, revoked, created_at, last_used_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[reclu] api_keys:", error.message);
  }

  const keys: ApiKeyListItem[] = ((data ?? []) as ApiKeyRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    plan: row.plan,
    revoked: row.revoked,
    createdAt: formatDay(row.created_at),
    lastUsedAt: row.last_used_at
      ? new Date(row.last_used_at).toLocaleDateString("es-CL", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })
      : null,
  }));

  const enabled = apiPublicEnabled();
  const plan = normalizeApiPlan(profile.plan);
  const dailyLimit = apiDailyLimit(plan);
  const limitText = dailyLimit.toLocaleString("es-CL");

  // Cabeceras que verá cada respuesta: se documentan también en la UI para
  // que quien integra sepa cuándo se acerca al tope (sin exponer la clave).
  const headersPreview = rateLimitHeaders(
    rateLimit({ plan, used: 0, day: apiDayKey(), today: apiDayKey() }),
  );

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="text-[28px] font-medium tracking-[-0.03em] text-ink-900 sm:text-[32px]">
          API
        </h1>
        <p className="mt-1.5 text-[15px] text-ink-500">
          Consulta los datos públicos de reclu desde tus propios sistemas con
          una clave personal.
        </p>
      </div>

      {!enabled && (
        <div className="border border-ink-200 px-4 py-3 text-[13px] leading-relaxed text-ink-500">
          La API pública todavía no está habilitada. Puedes revocar claves
          existentes, pero crear una nueva y llamar a la API quedará disponible
          cuando la activemos.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nueva clave</CardTitle>
          <CardDescription>
            {enabled
              ? `Tu plan permite ${limitText} llamadas por día por clave. Cada clave es personal: no la compartas ni la subas a un repositorio.`
              : "La emisión de claves está en pausa hasta habilitar la API pública."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApiKeysPanel
            enabled={enabled}
            keys={keys}
            limitText={limitText}
            createAction={createApiKeyAction}
            revokeAction={revokeApiKeyAction}
            headersPreview={headersPreview}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <LegalNotice kind="fintec" />
        <p className="text-[12px] leading-relaxed text-ink-500">
          Las declaraciones patrimoniales de funcionarios de Estados Unidos se
          ofrecen gratis y fuera de cualquier muro, conforme a 5 U.S.C. § 13107.
          La API entrega información pública: no ejecuta órdenes ni entrega
          recomendaciones personalizadas.
        </p>
      </div>
    </div>
  );
}
