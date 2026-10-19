"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createAlertRule, deleteAlertRule } from "@/app/actions/alert-rules";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/form-state";
import {
  alertRuleChannelLabel,
  alertRuleKindLabel,
  formatRuleValue,
  type AlertRuleChannel,
  type AlertRuleKind,
  type AlertRuleView,
} from "@/lib/alert-rules";

const KIND_FIELDS: {
  value: AlertRuleKind;
  label: string;
  placeholder: string;
  hint: string;
}[] = [
  {
    value: "ticker",
    label: "Un símbolo, en cualquier fuente",
    placeholder: "NVDA",
    hint: "Avisar cuando cualquier fuente publique ese símbolo. Ejemplo: NVDA.",
  },
  {
    value: "portfolio",
    label: "Un portafolio o una persona",
    placeholder: "Pelosi",
    hint: "Nombre o slug. Ejemplo: Pelosi.",
  },
  {
    value: "source",
    label: "Una fuente",
    placeholder: "house_disclosure",
    hint: "Identificador de la fuente. Ejemplo: house_disclosure.",
  },
  {
    value: "min_amount",
    label: "Un monto mínimo en dólares",
    placeholder: "1000000",
    hint: "Cifra en dólares, sin puntos. Ejemplo: 1000000 avisa desde US$1.000.000.",
  },
];

export function AlertRulesForm({
  rules,
  limit,
  canUseTelegram,
  unavailable,
}: {
  rules: AlertRuleView[];
  limit: number;
  canUseTelegram: boolean;
  unavailable: string | null;
}) {
  if (unavailable) {
    return <p className="text-[15px] text-ink-500">{unavailable}</p>;
  }

  const atLimit = rules.length >= limit;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] text-ink-500">
        {rules.length} de {limit} reglas
      </p>

      {rules.length === 0 ? (
        <p className="text-[15px] text-ink-500">Todavía no tienes reglas.</p>
      ) : (
        <ul className="border-t border-ink-200">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-col gap-3 border-b border-ink-200 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-[15px] text-ink-900">
                  {alertRuleKindLabel(rule.kind)} {formatRuleValue(rule.kind, rule.value)}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-500">
                  {alertRuleChannelLabel(rule.channel)}
                  {rule.active ? "" : " · Pausada"}
                </p>
              </div>
              <DeleteRuleButton id={rule.id} />
            </li>
          ))}
        </ul>
      )}

      {atLimit ? (
        <p className="text-[15px] text-ink-900">
          Alcanzaste el límite de tu plan ({limit}). Elimina una regla para crear otra.
        </p>
      ) : (
        <CreateRuleForm canUseTelegram={canUseTelegram} />
      )}
    </div>
  );
}

function CreateRuleForm({ canUseTelegram }: { canUseTelegram: boolean }) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(createAlertRule, {});
  const [kind, setKind] = useState<AlertRuleKind>("ticker");
  const [channel, setChannel] = useState<AlertRuleChannel>("email");
  const field = KIND_FIELDS.find((item) => item.value === kind) ?? KIND_FIELDS[0];

  return (
    <form action={formAction} className="flex flex-col gap-5 border-t border-ink-200 pt-6">
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-negative">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="text-sm font-medium text-positive">
          {state.success}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="alert-rule-kind" className="text-sm font-medium text-ink-900">
          Criterio
        </label>
        <select
          id="alert-rule-kind"
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as AlertRuleKind)}
          className="h-11 w-full rounded-none border border-ink-200 bg-white px-3 text-[15px] text-ink-900 focus:border-ink-900 focus:outline-none"
        >
          {KIND_FIELDS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="alert-rule-value" className="text-sm font-medium text-ink-900">
          Valor
        </label>
        <input
          id="alert-rule-value"
          name="value"
          required
          placeholder={field.placeholder}
          inputMode={kind === "min_amount" ? "decimal" : "text"}
          autoCapitalize={kind === "ticker" ? "characters" : "off"}
          className="h-11 w-full rounded-none border border-ink-200 bg-white px-3 text-[15px] text-ink-900 placeholder:text-ink-500 focus:border-ink-900 focus:outline-none"
        />
        <p className="text-xs text-ink-600">{field.hint}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="alert-rule-channel" className="text-sm font-medium text-ink-900">
          Canal
        </label>
        <select
          id="alert-rule-channel"
          name="channel"
          value={channel}
          onChange={(event) => setChannel(event.target.value as AlertRuleChannel)}
          className="h-11 w-full rounded-none border border-ink-200 bg-white px-3 text-[15px] text-ink-900 focus:border-ink-900 focus:outline-none"
        >
          <option value="email">Correo</option>
          <option value="telegram" disabled={!canUseTelegram}>
            Telegram (Pro)
          </option>
          <option value="both" disabled={!canUseTelegram}>
            Correo y Telegram (Pro)
          </option>
        </select>
      </div>

      <Button type="submit" loading={isPending} className="w-fit">
        Crear regla
      </Button>
    </form>
  );
}

function DeleteRuleButton({ id }: { id: string }) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(deleteAlertRule, {});

  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="id" value={id} />
      {state.error ? (
        <p role="alert" className="mb-1 text-xs font-medium text-negative">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="mb-1 text-xs font-medium text-positive">
          {state.success}
        </p>
      ) : null}
      <Button type="submit" variant="outline" size="sm" loading={isPending}>
        Eliminar
      </Button>
    </form>
  );
}
