// Supabase Edge Function: detect changes & create alerts
// Deploy: supabase functions deploy detect-changes
//
// Scheduled via pg_cron (see schema.sql) or manually:
//   supabase functions serve detect-changes --no-verify-jwt
//
// Env vars (set in Supabase dashboard → Edge Functions → Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   OPENROUTER_API_KEY, OPENROUTER_MODEL
//   RESEND_API_KEY, EMAIL_FROM

import { createClient } from "jsr:@supabase/supabase-js@2";

interface HoldingRow {
  id: string;
  portfolio_id: string;
  symbol: string;
  name: string;
  weight: number;
  previous_weight: number | null;
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

    // 1. Get all holdings that have a previous_weight (i.e. were updated by a scraper)
    const { data: changed, error } = await supabase
      .from("holdings")
      .select("*")
      .not("previous_weight", "is", null)
      .order("as_of", { ascending: false })
      .limit(500);

    if (error) throw error;
    if (!changed || changed.length === 0) {
      return Response.json({ alerts_created: 0, message: "No changes detected" }, { headers: corsHeaders });
    }

    const alertsToInsert: Array<Record<string, unknown>> = [];

    for (const h of changed as HoldingRow[]) {
      // BUGFIX: null previous_weight means the holding was just created by the
      // scraper (new trade) — treat it as a full-weight change, not as noise.
      const isNewHolding = h.previous_weight === null;
      const delta = isNewHolding ? h.weight : h.weight - h.previous_weight!;
      const absDelta = Math.abs(delta);

      if (!isNewHolding && absDelta < 0.5) continue; // ignore sub-0.5pp noise

      let type: string;
      let severity: string;

      if (isNewHolding || h.previous_weight === 0) {
        type = "new_trade";
        severity = absDelta >= 5 ? "high" : "medium";
      } else if (h.weight === 0) {
        type = "sold_trade";
        severity = absDelta >= 5 ? "high" : "medium";
      } else {
        type = "weight_change";
        severity = absDelta >= 5 ? "high" : absDelta >= 2 ? "medium" : "low";
      }

      const title =
        type === "new_trade"
          ? `Nueva posición: ${h.symbol} (${h.weight.toFixed(1)}%)`
          : type === "sold_trade"
            ? `Vendido: ${h.symbol}`
            : `${h.symbol}: ${delta > 0 ? "+" : ""}${delta.toFixed(1)}pp (ahora ${h.weight.toFixed(1)}%)`;

      alertsToInsert.push({
        portfolio_id: h.portfolio_id,
        type,
        severity,
        title,
        payload: {
          symbol: h.symbol,
          name: h.name,
          weight: h.weight,
          previous_weight: h.previous_weight,
          delta,
        },
        is_published: false, // published after AI summary is generated
      });
    }

    if (alertsToInsert.length === 0) {
      return Response.json({ alerts_created: 0 }, { headers: corsHeaders });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("alerts")
      .insert(alertsToInsert)
      .select("id, title, payload, portfolio_id");

    if (insertError) throw insertError;

    // 2. Generate AI summaries via OpenRouter (if configured)
    const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
    const model = Deno.env.get("OPENROUTER_MODEL") ?? "google/gemini-2.0-flash-001";

    let summarized = 0;
    if (openRouterKey && inserted) {
      for (const alert of inserted) {
        try {
          const summary = await generateSummary(openRouterKey, model, alert);
          if (summary) {
            await supabase
              .from("alerts")
              .update({ summary, is_published: true })
              .eq("id", alert.id);
            summarized++;
          } else {
            // Publish without summary if AI fails
            await supabase.from("alerts").update({ is_published: true }).eq("id", alert.id);
          }
        } catch {
          await supabase.from("alerts").update({ is_published: true }).eq("id", alert.id);
        }
      }
    } else if (inserted) {
      // No AI key — publish directly
      await supabase
        .from("alerts")
        .update({ is_published: true })
        .in(
          "id",
          inserted.map((a: { id: string }) => a.id),
        );
    }

    return Response.json(
      { alerts_created: inserted?.length ?? 0, summarized },
      { headers: corsHeaders },
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500, headers: corsHeaders },
    );
  }
});

async function generateSummary(
  apiKey: string,
  model: string,
  alert: { title: string; payload: Record<string, unknown>; portfolio_id: string },
): Promise<string | null> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "Eres un analista financiero conciso. Resume en 2-3 oraciones en español qué cambió en el portafolio y por qué podría ser relevante. No des consejos de inversión. Máximo 60 palabras.",
        },
        {
          role: "user",
          content: `Alerta: ${alert.title}\nDatos: ${JSON.stringify(alert.payload)}`,
        },
      ],
      max_tokens: 150,
      temperature: 0.3,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? null;
}
