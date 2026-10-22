import { type NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/safe-compare";

// Duración máxima de la función (en vercel.json los crons no admiten maxDuration).
export const maxDuration = 300;

/**
 * POST/GET /api/run-pipeline — corre el pipeline de alertas completo:
 *   1. detect-changes: holdings con previous_weight → alerts (is_published=false)
 *      + resúmenes AI (OpenRouter) + alertas de acumulación
 *   2. send-alerts: emails por Resend a los followers según plan/frecuencia
 *
 * Los scrapers Python corren APARTE (GitHub Actions, ver
 * .github/workflows/scrapers.yml) y escriben holdings en Supabase con
 * previous_weight. Este endpoint solo ejecuta detección + AI + email,
 * que viven en Supabase Edge Functions.
 *
 * AUTENTICACIÓN: SIEMPRE exige `Authorization: Bearer ${CRON_SECRET}`.
 * Vercel Cron llama con GET + ese header (formato oficial de Vercel Cron),
 * por eso GET también ejecuta el pipeline — sin el secreto no corre NADA
 * (401; 503 si CRON_SECRET no está configurado).
 */

/** Valida el header Authorization contra CRON_SECRET. null = válido. */
function checkAuth(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Sin secreto configurado: NUNCA ejecutar (el endpoint quedaría abierto)
    return NextResponse.json(
      {
        error:
          "CRON_SECRET no está configurado. El pipeline no puede ejecutarse sin él.",
      },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(auth, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

async function runPipeline(): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      {
        error:
          "Pipeline requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 },
    );
  }

  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  const results: Record<string, unknown> = {};

  // Paso 1: detectar cambios + resúmenes AI (Edge detect-changes)
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/detect-changes`, {
      method: "POST",
      headers,
    });
    results.detect = await res.json().catch(() => ({ status: res.status }));
    results.detect_status = res.status;
  } catch (err) {
    results.detect = { error: err instanceof Error ? err.message : "failed" };
    results.detect_status = 0;
  }

  // Paso 2: enviar emails (Edge send-alerts)
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-alerts`, {
      method: "POST",
      headers,
    });
    results.send = await res.json().catch(() => ({ status: res.status }));
    results.send_status = res.status;
  } catch (err) {
    results.send = { error: err instanceof Error ? err.message : "failed" };
    results.send_status = 0;
  }

  const ok = results.detect_status === 200 && results.send_status === 200;
  return NextResponse.json(
    {
      ok,
      ran_at: new Date().toISOString(),
      ...results,
    },
    { status: ok ? 200 : 500 },
  );
}

/** POST — invocación manual o de un scheduler externo con el secreto. */
export async function POST(request: NextRequest) {
  const denied = checkAuth(request);
  if (denied) return denied;
  return runPipeline();
}

/**
 * GET — lo que usa Vercel Cron (formato oficial: GET + Bearer CRON_SECRET).
 * Ejecuta el mismo pipeline que POST. Sin secreto no ejecuta nada.
 */
export async function GET(request: NextRequest) {
  const denied = checkAuth(request);
  if (denied) return denied;
  return runPipeline();
}
