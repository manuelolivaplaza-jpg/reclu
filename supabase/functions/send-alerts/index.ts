// Supabase Edge Function: send alert emails via Resend
// Deploy: supabase functions deploy send-alerts
//
// Env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY, EMAIL_FROM

import { createClient } from "jsr:@supabase/supabase-js@2";

interface AlertWithPortfolio {
  id: string;
  portfolio_id: string;
  type: string;
  severity: string;
  title: string;
  summary: string | null;
  created_at: string;
  portfolio: { id: string; slug: string; name: string };
}

interface Follower {
  user_id: string;
  profiles: { email: string; full_name: string | null; plan: string; alert_frequency: string };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SEVERITY_EMOJI: Record<string, string> = {
  low: "🔵",
  medium: "🟡",
  high: "🔴",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("EMAIL_FROM") ?? "reclu.cl <alertas@reclu.cl>";

    if (!resendKey) {
      return Response.json(
        { error: "RESEND_API_KEY not configured" },
        { status: 500, headers: corsHeaders },
      );
    }

    // 1. Find published alerts that haven't been delivered to anyone yet
    const { data: pendingAlerts, error: alertsErr } = await supabase
      .from("alerts")
      .select("*, portfolio:portfolios!inner(id, slug, name)")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (alertsErr) throw alertsErr;
    if (!pendingAlerts || pendingAlerts.length === 0) {
      return Response.json({ sent: 0, message: "No pending alerts" }, { headers: corsHeaders });
    }

    let totalSent = 0;

    for (const alert of pendingAlerts as AlertWithPortfolio[]) {
      // 2. Get followers of this portfolio
      const { data: followers } = await supabase
        .from("follows")
        .select("user_id, profiles!inner(email, full_name, plan, alert_frequency)")
        .eq("portfolio_id", alert.portfolio_id);

      if (!followers || followers.length === 0) continue;

      // 3. Filter out users who already received this alert
      const { data: delivered } = await supabase
        .from("alert_deliveries")
        .select("user_id")
        .eq("alert_id", alert.id);

      const deliveredIds = new Set((delivered ?? []).map((d: { user_id: string }) => d.user_id));

      for (const f of followers as Follower[]) {
        if (deliveredIds.has(f.user_id)) continue;
        // Free users only get daily digest — skip realtime sends
        if (f.profiles.plan !== "pro" && f.profiles.alert_frequency === "realtime") continue;

        const html = renderEmail(alert, f.profiles.full_name ?? "Hola");

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: f.profiles.email,
            subject: `${SEVERITY_EMOJI[alert.severity] ?? "📢"} ${alert.portfolio.name}: ${alert.title}`,
            html,
          }),
        });

        if (res.ok) {
          totalSent++;
          await supabase.from("alert_deliveries").insert({
            alert_id: alert.id,
            user_id: f.user_id,
            email_sent: true,
            sent_at: new Date().toISOString(),
          });
        }
      }
    }

    return Response.json({ sent: totalSent }, { headers: corsHeaders });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500, headers: corsHeaders },
    );
  }
});

/** Render a clean, responsive alert email (light theme, matches brand). */
function renderEmail(alert: AlertWithPortfolio, name: string): string {
  const portfolioUrl = `https://reclu.cl/portfolio/${alert.portfolio.slug}`;
  const summaryBlock = alert.summary
    ? `<div style="margin:16px 0;padding:16px;border:1px solid #dbeafe;background:#eff6ff;border-radius:8px;">
         <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#1e40af;">✨ Resumen AI</p>
         <p style="margin:0;font-size:14px;line-height:1.6;color:#1e3a8a;">${escapeHtml(alert.summary)}</p>
       </div>`
    : `<p style="font-size:13px;color:#697386;">Actualiza a Pro para recibir resúmenes con análisis AI.</p>`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <p style="font-size:18px;font-weight:600;color:#1a1f36;margin:0 0 4px;">reclu<span style="color:#2563eb;">.cl</span></p>
    <p style="font-size:13px;color:#697386;margin:0 0 24px;">Alerta de portafolio</p>
    <div style="background:#ffffff;border:1px solid #eef2f7;border-radius:12px;padding:24px;">
      <p style="font-size:14px;color:#697386;margin:0 0 4px;">${escapeHtml(alert.portfolio.name)}</p>
      <h1 style="font-size:18px;font-weight:600;color:#1a1f36;margin:0 0 16px;">${escapeHtml(alert.title)}</h1>
      ${summaryBlock}
      <a href="${portfolioUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:8px;">Ver portafolio</a>
    </div>
    <p style="font-size:11px;color:#8792a2;line-height:1.6;margin:24px 0 0;">
      Información pública con fines informativos. No constituye asesoría de inversión.
      <a href="https://reclu.cl/settings" style="color:#2563eb;">Administrar alertas</a>
    </p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
