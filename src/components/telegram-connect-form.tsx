"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { prepareTelegramLink, updateAlertChannel } from "@/app/actions/settings";
import type { FormState } from "@/lib/form-state";
import type { AlertChannelValue } from "@/lib/plans";

const CHANNELS: { value: AlertChannelValue; label: string }[] = [
  { value: "email", label: "Correo" },
  { value: "telegram", label: "Telegram" },
  { value: "both", label: "Correo y Telegram" },
];

export function TelegramConnectForm({
  allowed,
  channel,
  linked,
  href,
  botReady,
}: {
  allowed: boolean;
  channel: string;
  linked: boolean;
  href: string | null;
  botReady: boolean;
}) {
  const [linkState, linkAction, linkPending] = useActionState<FormState, FormData>(prepareTelegramLink, {});
  const [channelState, channelAction, channelPending] = useActionState<FormState, FormData>(
    updateAlertChannel,
    {},
  );

  if (!allowed) {
    return (
      <p className="text-[15px] text-ink-500">
        Las alertas por Telegram están en Pro, Elite y durante la prueba.{" "}
        <Link href="/upgrade?plan=pro" className="text-ink-900">
          Ver planes
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={channelAction} className="flex flex-col gap-3">
        {channelState.success && (
          <p role="status" className="text-sm font-medium text-positive">
            {channelState.success}
          </p>
        )}
        {channelState.error && (
          <p role="alert" className="text-sm text-negative">
            {channelState.error}
          </p>
        )}
        <fieldset className="flex flex-col gap-3">
          <legend className="text-[13px] text-ink-500">Canal</legend>
          {CHANNELS.map((item) => (
            <label key={item.value} className="flex items-center gap-3 text-[15px] text-ink-900">
              <input
                type="radio"
                name="alert_channel"
                value={item.value}
                defaultChecked={channel === item.value}
                className="accent-ink-900"
              />
              {item.label}
            </label>
          ))}
        </fieldset>
        <Button type="submit" variant="outline" loading={channelPending} className="w-fit">
          Guardar canal
        </Button>
      </form>

      <div className="border-t border-ink-200 pt-6">
        <p className="text-[13px] text-ink-500">
          {linked ? "Chat vinculado." : "Todavía no hay un chat vinculado."}
        </p>
        {!botReady && (
          <p className="mt-2 text-[13px] text-ink-500">El bot de Telegram todavía no está configurado.</p>
        )}
        {href && (
          <a href={href} className="mt-3 inline-block text-[15px] text-ink-900 underline">
            Abrir Telegram y vincular
          </a>
        )}
        <form action={linkAction} className="mt-4">
          {linkState.success && (
            <p role="status" className="mb-3 text-sm font-medium text-positive">
              {linkState.success}
            </p>
          )}
          {linkState.error && (
            <p role="alert" className="mb-3 text-sm text-negative">
              {linkState.error}
            </p>
          )}
          <Button type="submit" variant="outline" loading={linkPending} className="w-fit">
            {href ? "Generar otro enlace" : "Generar enlace"}
          </Button>
        </form>
      </div>
    </div>
  );
}
