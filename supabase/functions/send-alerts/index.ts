// Supabase Edge Function: send alert emails via Resend
// Deploy: supabase functions deploy send-alerts
//
// Env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   RESEND_API_KEY, EMAIL_FROM

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const alerts = pendingAlerts as AlertWithPortfolio[];

    // Free users get one grouped digest. Pro users stay on the per-alert loop.
    totalSent += await sendFreeDigests(supabase, alerts, resendKey, from);

    for (const alert of alerts) {
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

      for (const row of followers ?? []) {
        const profile = firstProfile(row.profiles);
        if (!profile) continue;
        if (deliveredIds.has(row.user_id)) continue;
        // Free plans are handled by the digest above.
        if (profile.plan !== "pro") continue;

        const html = renderEmail(alert, profile.full_name ?? "Hola");

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: profile.email,
            subject: `reclu.cl — ${alert.portfolio.name}: ${alert.title}`,
            html,
          }),
        });

        if (res.ok) {
          totalSent++;
          await supabase.from("alert_deliveries").insert({
            alert_id: alert.id,
            user_id: row.user_id,
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

const FONT =
  "'Instrument Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

/** Color a return only. Positive is green, negative is red, zero stays ink. */
function colorizeReturns(escaped: string): string {
  return escaped.replace(/[+\u2212-]?\d+(?:[.,]\d+)?\s*%/g, (match) => {
    const value = Number.parseFloat(
      match.replace("%", "").replace(/\s/g, "").replace(",", ".").replace("\u2212", "-"),
    );
    if (!Number.isFinite(value) || value === 0) return match;
    const color = value > 0 ? "#0f7a32" : "#c81e1e";
    return `<span style="color:${color};font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1;">${match}</span>`;
  });
}

/** Render the alert email: white, 1px rules, black pill. No brand blue. */
function renderEmail(alert: AlertWithPortfolio, _name: string): string {
  const portfolioUrl = `https://reclu.cl/portfolio/${alert.portfolio.slug}`;
  const title = colorizeReturns(escapeHtml(alert.title));
  const summaryBlock = alert.summary
    ? `<div style="margin:20px 0 0;padding:0 0 0 14px;border-left:2px solid #0a0a0a;background:#ffffff;">
         <p style="margin:0 0 6px;font-size:13px;font-weight:400;line-height:1.4;color:#6b6b6b;">Resumen AI</p>
         <p style="margin:0;font-size:15px;line-height:1.5;color:#0a0a0a;">${colorizeReturns(escapeHtml(alert.summary))}</p>
       </div>`
    : `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#6b6b6b;">Actualiza a Pro para recibir resúmenes con análisis AI.</p>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap">
<style>
  a.reclu-manage { color: #0a0a0a; text-decoration: none; }
  a.reclu-manage:hover { text-decoration: underline; }
</style>
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#0a0a0a;font-family:${FONT};">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <p style="margin:0 0 24px;font-size:18px;font-weight:600;letter-spacing:-0.04em;line-height:1;color:#0a0a0a;">reclu</p>
    <div style="background:#ffffff;border:1px solid #e6e6e6;border-radius:0;box-shadow:none;padding:24px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:400;line-height:1.4;color:#6b6b6b;">${escapeHtml(alert.portfolio.name)}</p>
      <h1 style="margin:0;font-size:20px;font-weight:600;letter-spacing:-0.03em;line-height:1.2;color:#0a0a0a;">${title}</h1>
      ${summaryBlock}
      <a href="${portfolioUrl}" style="display:inline-block;margin-top:24px;background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;line-height:1;padding:14px 22px;border-radius:999px;">Ver portafolio</a>
    </div>
    <p style="margin:24px 0 0;font-size:11px;line-height:1.6;color:#6b6b6b;">
      Información pública con fines informativos. No constituye asesoría de inversión.
      <a class="reclu-manage" href="https://reclu.cl/settings" style="color:#0a0a0a;text-decoration:none;">Administrar alertas</a>
    </p>
  </div>
</body>
</html>`;
}

interface ProfileRow {
  email: string;
  full_name: string | null;
  plan: string;
  alert_frequency: string;
}

/** Supabase may type an inner join as one row or as an array. */
function firstProfile(profiles: ProfileRow | ProfileRow[] | null | undefined): ProfileRow | null {
  if (!profiles) return null;
  return Array.isArray(profiles) ? profiles[0] ?? null : profiles;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * One email for a free user: alerts grouped by portfolio.
 * Empty input returns an empty string so the caller sends nothing.
 */
function buildDigest(alerts: AlertWithPortfolio[], name: string): string {
  if (alerts.length === 0) return "";

  const groups = new Map<string, { portfolio: AlertWithPortfolio["portfolio"]; alerts: AlertWithPortfolio[] }>();
  for (const alert of alerts) {
    const key = alert.portfolio.id;
    const group = groups.get(key) ?? { portfolio: alert.portfolio, alerts: [] };
    group.alerts.push(alert);
    groups.set(key, group);
  }

  const sections = [...groups.values()].map((group) => {
    const items = group.alerts.map((alert) => {
      const summary = alert.summary
        ? `<p style="margin:6px 0 0;font-size:15px;line-height:1.5;color:#0a0a0a;">${colorizeReturns(escapeHtml(alert.summary))}</p>`
        : "";
      return `<div style="padding:14px 0;border-top:1px solid #e6e6e6;">
        <p style="margin:0;font-size:16px;font-weight:500;letter-spacing:-0.03em;line-height:1.3;color:#0a0a0a;">${colorizeReturns(escapeHtml(alert.title))}</p>
        ${summary}
      </div>`;
    }).join("");

    const portfolioUrl = `https://reclu.cl/portfolio/${group.portfolio.slug}`;
    return `<section style="margin-top:28px;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:400;line-height:1.4;color:#6b6b6b;">${escapeHtml(group.portfolio.name)}</p>
      ${items}
      <a href="${portfolioUrl}" style="display:inline-block;margin-top:12px;background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;line-height:1;padding:14px 22px;border-radius:999px;">Ver portafolio</a>
    </section>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap">
</head>
<body style="margin:0;padding:0;background:#ffffff;color:#0a0a0a;font-family:${FONT};">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <p style="margin:0 0 24px;font-size:18px;font-weight:600;letter-spacing:-0.04em;line-height:1;color:#0a0a0a;">reclu</p>
    <h1 style="margin:0 0 12px;font-size:28px;font-weight:500;letter-spacing:-0.04em;line-height:1;color:#0a0a0a;">Tu resumen reclu</h1>
    <p style="margin:0;font-size:15px;line-height:1.5;color:#6b6b6b;">Hola ${escapeHtml(name)}, estos son los cambios en los portafolios que sigues.</p>
    ${sections}
    <p style="margin:32px 0 0;padding-top:20px;border-top:1px solid #e6e6e6;font-size:11px;line-height:1.6;color:#6b6b6b;">
      Información pública con fines informativos. No constituye asesoría de inversión.
      <a href="https://reclu.cl/settings" style="color:#0a0a0a;text-decoration:none;">Administrar alertas</a>
    </p>
  </div>
</body>
</html>`;
}

/** Group every pending alert of the portfolios a free user follows into one email. */
async function sendFreeDigests(
  supabase: SupabaseClient,
  alerts: AlertWithPortfolio[],
  resendKey: string,
  from: string,
): Promise<number> {
  if (alerts.length === 0) return 0;

  const portfolioIds = [...new Set(alerts.map((alert) => alert.portfolio_id))];
  const { data: follows, error: followsErr } = await supabase
    .from("follows")
    .select("user_id, portfolio_id, profiles!inner(email, full_name, plan, alert_frequency)")
    .in("portfolio_id", portfolioIds);
  if (followsErr) throw followsErr;
  if (!follows || follows.length === 0) return 0;

  const alertIds = alerts.map((alert) => alert.id);
  const { data: delivered, error: deliveredErr } = await supabase
    .from("alert_deliveries")
    .select("alert_id, user_id")
    .in("alert_id", alertIds);
  if (deliveredErr) throw deliveredErr;

  const deliveredKeys = new Set(
    (delivered ?? []).map((row: { alert_id: string; user_id: string }) => `${row.alert_id}:${row.user_id}`),
  );

  const alertsByPortfolio = new Map<string, AlertWithPortfolio[]>();
  for (const alert of alerts) {
    const list = alertsByPortfolio.get(alert.portfolio_id) ?? [];
    list.push(alert);
    alertsByPortfolio.set(alert.portfolio_id, list);
  }

  const buckets = new Map<string, { email: string; name: string; alerts: AlertWithPortfolio[]; seen: Set<string> }>();

  for (const row of follows) {
    const profile = firstProfile(row.profiles);
    if (!profile || profile.plan === "pro") continue;
    const portfolioAlerts = alertsByPortfolio.get(row.portfolio_id) ?? [];
    if (portfolioAlerts.length === 0) continue;

    let bucket = buckets.get(row.user_id);
    if (!bucket) {
      bucket = {
        email: profile.email,
        name: profile.full_name?.trim() || "Hola",
        alerts: [],
        seen: new Set<string>(),
      };
      buckets.set(row.user_id, bucket);
    }

    for (const alert of portfolioAlerts) {
      if (deliveredKeys.has(`${alert.id}:${row.user_id}`)) continue;
      if (bucket.seen.has(alert.id)) continue;
      bucket.seen.add(alert.id);
      bucket.alerts.push(alert);
    }
  }

  let sent = 0;
  for (const [userId, bucket] of buckets) {
    if (bucket.alerts.length === 0 || !bucket.email) continue;

    const html = buildDigest(bucket.alerts, bucket.name);
    if (!html) continue;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: bucket.email,
        subject: "Tu resumen reclu",
        html,
      }),
    });

    if (!res.ok) continue;

    sent++;
    await supabase.from("alert_deliveries").insert(
      bucket.alerts.map((alert) => ({
        alert_id: alert.id,
        user_id: userId,
        email_sent: true,
        sent_at: new Date().toISOString(),
      })),
    );
  }

  return sent;
}
