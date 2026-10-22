import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F80 — punto 4: la bandera funcional va ANTES del chequeo de `CRON_SECRET`.
 *
 * Con la función apagada la respuesta debe ser 404 aunque falte el secreto
 * (antes respondía 503) y aunque el secreto sea incorrecto (antes 401): así
 * no se revela que el job existe ni se distingue "falta el secreto" de
 * "no hay autorización".
 */
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { POST as ALERTS_POST } from "@/app/api/impact/alerts/route";
import { POST as PRECOMPUTE_POST } from "@/app/api/impact/precompute/route";

function request(url: string, secret?: string): Request {
  const headers: Record<string, string> = {};
  if (secret !== undefined) headers.Authorization = `Bearer ${secret}`;
  return new Request(url, { method: "POST", headers });
}

const PRECOMPUTE_URL = "http://localhost/api/impact/precompute";
const ALERTS_URL = "http://localhost/api/impact/alerts";

beforeEach(() => {
  vi.clearAllMocks();
  // Si se llamara al cliente admin, la ruta se habría saltado la bandera.
  mocks.createAdminClient.mockImplementation(() => {
    throw new Error("no se debe crear el cliente admin con la bandera apagada");
  });
  delete process.env.CRON_SECRET;
  process.env.NEWS_IMPACT_ENABLED = "false";
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.NEWS_IMPACT_ENABLED;
});

describe("F80: bandera apagada responde 404 antes de mirar CRON_SECRET", () => {
  it("precompute: sin CRON_SECRET responde 404 (no 503)", async () => {
    const res = await PRECOMPUTE_POST(request(PRECOMPUTE_URL));

    expect(res.status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("precompute: con CRON_SECRET incorrecto responde 404 (no 401)", async () => {
    process.env.CRON_SECRET = "cron-secret";

    const res = await PRECOMPUTE_POST(request(PRECOMPUTE_URL, "otro-secreto"));

    expect(res.status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("alerts: sin CRON_SECRET responde 404 (no 503)", async () => {
    const res = await ALERTS_POST(request(ALERTS_URL));

    expect(res.status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("alerts: con CRON_SECRET incorrecto responde 404 (no 401)", async () => {
    process.env.CRON_SECRET = "cron-secret";

    const res = await ALERTS_POST(request(ALERTS_URL, "otro-secreto"));

    expect(res.status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("con la bandera encendida el chequeo de secreto sigue funcionando", async () => {
    process.env.NEWS_IMPACT_ENABLED = "true";

    // Sin secreto configurado: 503 (el mensaje de "falta CRON_SECRET").
    delete process.env.CRON_SECRET;
    const sinSecreto = await PRECOMPUTE_POST(request(PRECOMPUTE_URL));
    expect(sinSecreto.status).toBe(503);

    // Con secreto incorrecto: 401.
    process.env.CRON_SECRET = "cron-secret";
    const malSecreto = await PRECOMPUTE_POST(request(PRECOMPUTE_URL, "otro"));
    expect(malSecreto.status).toBe(401);
  });
});
