"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { updatePortfolioAlerts } from "@/app/actions/portfolio-consent";
import type { FormState } from "@/lib/form-state";
import {
  AUTO_ALERTS_LABEL,
  autoAlertsDescription,
  PORTFOLIO_RELEVANCE_THRESHOLDS,
} from "@/lib/portfolio-consent";
import type { AlertChannelValue, AutoAlertsMode } from "@/lib/plans";

const CHANNEL_LABELS: Record<AlertChannelValue, string> = {
  email: "Correo",
  telegram: "Telegram",
  both: "Correo y Telegram",
};

/**
 * Ajustes de alertas automáticas (F75). El interruptor parte apagado
 * (`user_portfolio_settings.auto_alerts` default false), respeta el modo que
 * permite el plan (`autoAlerts` de plans.ts) y exige consentimiento.
 */
export function PortfolioAlertSettings({
  autoAlerts,
  minRelevance,
  alertChannel,
  planAutoAlerts,
  allowedChannels,
  hasConsent,
}: {
  autoAlerts: boolean;
  minRelevance: number;
  alertChannel: string;
  planAutoAlerts: AutoAlertsMode;
  allowedChannels: AlertChannelValue[];
  hasConsent: boolean;
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    updatePortfolioAlerts,
    {},
  );

  const planAllows = planAutoAlerts !== "none";
  const canToggle = planAllows && hasConsent;
  const thresholds = Array.from(
    new Set<number>([
      ...PORTFOLIO_RELEVANCE_THRESHOLDS,
      Number.isFinite(minRelevance) ? minRelevance : 0.5,
    ]),
  ).sort((a, b) => a - b);
  const channels = allowedChannels.length > 0 ? allowedChannels : ["email" as const];

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="border-t border-ink-200 pt-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="auto_alerts"
            defaultChecked={autoAlerts}
            disabled={!canToggle}
            className="mt-0.5 size-4 shrink-0 accent-ink-900 disabled:opacity-50"
          />
          <span>
            <span className="block text-[15px] text-ink-900">{AUTO_ALERTS_LABEL}</span>
            <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-500">
              {autoAlertsDescription(planAutoAlerts)}
            </span>
          </span>
        </label>

        {!planAllows && (
          <p className="mt-2 pl-7 text-[13px] text-ink-500">
            Las alertas automáticas no están incluidas en tu plan actual.
          </p>
        )}
        {planAllows && !hasConsent && (
          <p className="mt-2 pl-7 text-[13px] text-ink-500">
            Primero otorga el consentimiento explícito de arriba.
          </p>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-ink-500">Umbral de relevancia</span>
          <select
            name="min_relevance"
            defaultValue={String(minRelevance)}
            className="h-11 border border-ink-200 bg-white px-3 text-[15px] text-ink-900"
          >
            {thresholds.map((value) => (
              <option key={value} value={String(value)}>
                {Math.round(value * 100)}% o más
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-ink-500">Canal</span>
          <select
            name="alert_channel"
            defaultValue={alertChannel}
            className="h-11 border border-ink-200 bg-white px-3 text-[15px] text-ink-900"
          >
            {channels.map((value) => (
              <option key={value} value={value}>
                {CHANNEL_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-[13px] leading-relaxed text-ink-500">
        Telegram requiere que vincules tu chat más arriba. Si no está vinculado,
        el aviso se envía por correo.
      </p>

      {state.error && (
        <p role="alert" className="text-sm font-medium text-negative">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm font-medium text-positive">
          {state.success}
        </p>
      )}

      <Button type="submit" variant="outline" loading={isPending} className="w-fit">
        Guardar alertas
      </Button>
    </form>
  );
}
