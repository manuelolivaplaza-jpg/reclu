import { type NextRequest, NextResponse } from "next/server";

/**
 * POST /api/run-pipeline — runs the full alert pipeline:
 *   1. detect-changes (scrapers already wrote holdings via previous_weight)
 *   2. (OpenRouter summaries happen inside detect-changes)
 *   3. send-alerts (Resend emails to followers)
 *
 * Protect with CRON_SECRET: call with header `Authorization: Bearer <secret>`.
 * Schedule with Vercel Cron (see vercel.json) or an external scheduler.
 *
 * NOTE: The Python scrapers run separately (GitHub Actions / VPS cron) and
 * write holdings to Supabase. This endpoint handles detection + AI + email,
 * which live in Supabase Edge Functions.
 */
export async function POST(request: NextRequest) {
  // --- Auth: shared secret ---
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      {
        error:
          "Pipeline requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.",
      },
      { status: 500 },
    );
  }

  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  const results: Record<string, unknown> = {};

  // Step 1 + 2: detect changes + AI summaries
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/detect-changes`, {
      method: "POST",
      headers,
    });
    results.detect = await res.json().catch(() => ({ status: res.status }));
  } catch (err) {
    results.detect = { error: err instanceof Error ? err.message : "failed" };
  }

  // Step 3: send emails
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-alerts`, {
      method: "POST",
      headers,
    });
    results.send = await res.json().catch(() => ({ status: res.status }));
  } catch (err) {
    results.send = { error: err instanceof Error ? err.message : "failed" };
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    ...results,
  });
}

/** Vercel Cron hits GET — allow it as a no-op status. */
export async function GET() {
  return NextResponse.json({
    service: "reclu.cl pipeline",
    status: "ready",
    hint: "POST with Authorization: Bearer <CRON_SECRET> to run detect-changes + send-alerts",
  });
}
