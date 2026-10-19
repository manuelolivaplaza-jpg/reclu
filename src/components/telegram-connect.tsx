import { canUseTelegram } from "@/lib/plans";
import type { Profile } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { TelegramConnectForm } from "@/components/telegram-connect-form";

/** Bloque de Ajustes. El perfil se queda en el servidor; el cliente solo ve canal y enlace. */
export function TelegramConnect({ profile }: { profile: Profile }) {
  const allowed = canUseTelegram(profile.plan, profile.trial_ends_at);
  const bot = (process.env.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "");
  const code = profile.telegram_link_code ?? null;
  const href =
    allowed && bot && code
      ? `https://t.me/${encodeURIComponent(bot)}?start=${encodeURIComponent(code)}`
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
        <CardDescription>
          Recibe el mismo aviso en un chat, además o en lugar del correo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TelegramConnectForm
          allowed={allowed}
          channel={profile.alert_channel ?? "email"}
          linked={Boolean(profile.telegram_chat_id)}
          href={href}
          botReady={bot.length > 0}
        />
      </CardContent>
    </Card>
  );
}
