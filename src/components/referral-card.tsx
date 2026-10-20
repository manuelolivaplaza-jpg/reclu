"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Tarjeta de invitación (Ajustes). Sólo se renderiza con
 * `REFERRALS_ENABLED=true` y un `referral_code` real.
 *
 * El premio es para el patrocinador: un mes de Pro cuando el invitado
 * confirma su primer pago. Sin promesas de dinero ni asesoría.
 */
export function ReferralCard({ code, siteUrl }: { code: string; siteUrl: string }) {
  const [copied, setCopied] = useState(false);
  const base = siteUrl.replace(/\/+$/, "");
  const link = `${base}/?ref=${encodeURIComponent(code)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el enlace queda visible para copiarlo a mano.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invita a un amigo</CardTitle>
        <CardDescription>
          Comparte tu enlace. Cuando tu invitado active su primer pago, ganas un
          mes de Pro.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between border-y border-ink-200 py-3">
            <span className="text-[13px] uppercase tracking-[0.08em] text-ink-500">
              Tu código
            </span>
            <span className="font-mono text-[15px] tracking-[0.06em] text-ink-900">
              {code}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              aria-label="Enlace de invitación"
              readOnly
              value={link}
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-[13px]"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyLink}
              className="shrink-0"
            >
              {copied ? "Copiado" : "Copiar enlace"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
