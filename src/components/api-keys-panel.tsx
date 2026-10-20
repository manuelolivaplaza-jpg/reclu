"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiKeyFormState } from "@/lib/api-keys";

export interface ApiKeyListItem {
  id: string;
  name: string;
  prefix: string;
  plan: string;
  revoked: boolean;
  /** Fecha ya formateada en el servidor (evita desfases de hidratación). */
  createdAt: string;
  lastUsedAt: string | null;
}

type Action = (prev: ApiKeyFormState, formData: FormData) => Promise<ApiKeyFormState>;

const PLAN_LABELS: Record<string, string> = {
  free: "Gratis",
  pro: "Pro",
  elite: "Elite",
};

function planLabel(plan: string): string {
  return PLAN_LABELS[plan] ?? "Gratis";
}

/**
 * Panel de claves de API. La clave en claro solo vive en el estado de la
 * acción de creación: se muestra una vez y no se vuelve a pedir al servidor.
 */
export function ApiKeysPanel({
  enabled,
  keys,
  limitText,
  createAction,
  revokeAction,
  headersPreview,
}: {
  enabled: boolean;
  keys: ApiKeyListItem[];
  limitText: string;
  createAction: Action;
  revokeAction: Action;
  headersPreview: Record<string, string>;
}) {
  const [createState, createFormAction, createPending] = useActionState<
    ApiKeyFormState,
    FormData
  >(createAction, {});
  const [revokeState, revokeFormAction, revokePending] = useActionState<
    ApiKeyFormState,
    FormData
  >(revokeAction, {});

  return (
    <div className="flex flex-col gap-8">
      {enabled && (
        <form action={createFormAction} className="flex flex-col gap-4">
          <Input
            name="name"
            label="Nombre (opcional)"
            placeholder="Mi bot, planilla, integración…"
            maxLength={60}
            autoComplete="off"
            hint="Solo para que reconozcas la clave en esta lista."
          />
          <Button type="submit" loading={createPending} className="w-fit">
            Crear clave
          </Button>
        </form>
      )}

      {createState.error && (
        <p role="alert" className="text-sm text-negative">
          {createState.error}
        </p>
      )}

      {createState.key && (
        <div className="border border-ink-900 px-4 py-3">
          <p className="text-[13px] font-medium text-ink-900">
            {createState.success ?? "Clave creada."}
          </p>
          <code className="mt-2 block break-all font-mono text-[13px] leading-relaxed text-ink-900">
            {createState.key}
          </code>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
            Esta es la única vez que verás la clave completa. No la guardamos en
            claro: si la pierdes, revócala y crea otra.
          </p>
        </div>
      )}

      <div className="border-t border-ink-200 pt-6">
        <h2 className="text-[15px] font-medium text-ink-900">Tus claves</h2>

        {revokeState.success && (
          <p role="status" className="mt-3 text-sm font-medium text-positive">
            {revokeState.success}
          </p>
        )}
        {revokeState.error && (
          <p role="alert" className="mt-3 text-sm text-negative">
            {revokeState.error}
          </p>
        )}

        {keys.length === 0 ? (
          <p className="mt-3 text-[15px] text-ink-500">
            Todavía no tienes claves.
          </p>
        ) : (
          <ul className="mt-3">
            {keys.map((key) => (
              <li
                key={key.id}
                className="flex flex-col gap-2 border-b border-ink-200 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-[15px] text-ink-900">
                    {key.name}
                    {key.revoked && (
                      <span className="ml-2 text-[13px] text-ink-500">
                        (revocada)
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 break-all font-mono text-[13px] text-ink-500">
                    {key.prefix}…
                  </p>
                  <p className="mt-1 text-[12px] text-ink-500">
                    Plan {planLabel(key.plan)} · Creada el {key.createdAt}
                    {key.lastUsedAt ? ` · Último uso: ${key.lastUsedAt}` : " · Sin uso"}
                  </p>
                </div>
                {!key.revoked && (
                  <form action={revokeFormAction} className="shrink-0">
                    <input type="hidden" name="id" value={key.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      loading={revokePending}
                    >
                      Revocar
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-ink-200 pt-6">
        <h2 className="text-[15px] font-medium text-ink-900">Cómo se usa</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">
          Envía la clave en el encabezado{" "}
          <code className="font-mono text-ink-900">Authorization: Bearer &lt;clave&gt;</code>.
          El límite de {limitText} llamadas por día es por clave y se reinicia a
          medianoche UTC. Al agotarlo, la API responde 429 hasta el día siguiente.
        </p>
        <dl className="mt-3 border-t border-ink-200 text-[12px] text-ink-500">
          {Object.entries(headersPreview).map(([header, value]) => (
            <div
              key={header}
              className="flex justify-between gap-4 border-b border-ink-200 py-2"
            >
              <dt className="font-mono text-ink-900">{header}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
          No registramos la clave en claro ni la mostramos en logs. Guardamos
          solo su hash y el contador diario, sin IP ni datos personales
          adicionales (Leyes 19.628 y 21.719).
        </p>
      </div>
    </div>
  );
}
