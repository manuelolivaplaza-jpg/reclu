import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F75 — consentimiento, retiro y borrado de Mi portafolio.
 * Ningún Supabase real: `createClient` se reemplaza por un doble en memoria.
 */

const state = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  profile: { plan: "pro", trial_ends_at: null as string | null },
  settings: null as Record<string, unknown> | null,
  calls: [] as {
    table: string;
    op: string;
    values?: Record<string, unknown>;
    options?: unknown;
  }[],
  rpcCalls: [] as { name: string }[],
  upsertError: null as { message: string } | null,
  updateError: null as { message: string } | null,
  rpcError: null as { message: string } | null,
  rpcData: 3 as number | null,
}));

function makeBuilder(table: string) {
  let operation = "select";
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => ({
      data: table === "profiles" ? state.profile : null,
      error: null,
    }),
    maybeSingle: async () => ({
      data: table === "user_portfolio_settings" ? state.settings : null,
      error: null,
    }),
    update(values: Record<string, unknown>) {
      operation = "update";
      state.calls.push({ table, op: operation, values });
      return builder;
    },
    upsert(values: Record<string, unknown>, options?: unknown) {
      operation = "upsert";
      state.calls.push({ table, op: operation, values, options });
      return Promise.resolve({ data: null, error: state.upsertError });
    },
    then(
      onFulfilled: (value: { data: null; error: { message: string } | null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      const error = operation === "update" ? state.updateError : null;
      return Promise.resolve({ data: null, error }).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
    from: (table: string) => makeBuilder(table),
    rpc: async (name: string) => {
      state.rpcCalls.push({ name });
      return { data: state.rpcData, error: state.rpcError };
    },
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  deleteMyPortfolio,
  grantPortfolioConsent,
  updatePortfolioAlerts,
  withdrawPortfolioConsent,
} from "@/app/actions/portfolio-consent";
import {
  DELETE_CONFIRMATION_WORD,
  PORTFOLIO_CONSENT_VERSION,
  isDeleteConfirmationValid,
  portfolioConsentErrorMessage,
  portfolioConsentParagraphs,
  portfolioConsentStatus,
  validatePortfolioAlertSettings,
} from "@/lib/portfolio-consent";

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.stubEnv("MY_PORTFOLIO_ENABLED", "true");
  state.user = { id: "user-1" };
  state.profile = { plan: "pro", trial_ends_at: null };
  state.settings = null;
  state.calls = [];
  state.rpcCalls = [];
  state.upsertError = null;
  state.updateError = null;
  state.rpcError = null;
  state.rpcData = 3;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("texto de consentimiento", () => {
  it("usa el texto de la §2.5: finalidad, datos sensibles, IA y borrado", () => {
    const text = portfolioConsentParagraphs("google/gemini-2.0-flash-001").join(" ");
    expect(text).toMatch(/autorizo a reclu a tratar los datos de mi cartera/i);
    expect(text).toMatch(/datos sensibles/i);
    expect(text).toMatch(/openrouter inc\./i);
    expect(text).toContain("google/gemini-2.0-flash-001");
    expect(text).toMatch(/sin mi nombre, correo ni montos/i);
    expect(text).toMatch(/fuera de chile/i);
    expect(text).toMatch(/no me da recomendaciones de inversión/i);
    expect(text).toMatch(/retirar este consentimiento y borrar mi cartera/i);
    expect(text).toContain(PORTFOLIO_CONSENT_VERSION);
  });

  it("no deja el modelo en blanco si no está configurado", () => {
    expect(portfolioConsentParagraphs("").join(" ")).toContain(
      "el modelo configurado en el servidor",
    );
  });
});

describe("versión del consentimiento", () => {
  it("sin consent_at no hay consentimiento", () => {
    expect(portfolioConsentStatus(null, null)).toBe("none");
  });

  it("la versión vigente es la única que cuenta", () => {
    expect(
      portfolioConsentStatus("2026-10-20T10:00:00Z", PORTFOLIO_CONSENT_VERSION),
    ).toBe("current");
    expect(portfolioConsentStatus("2026-10-20T10:00:00Z", "2026-10-01.v0")).toBe(
      "outdated",
    );
    expect(portfolioConsentStatus("2026-10-20T10:00:00Z", null)).toBe("outdated");
  });

  it("el mensaje pide aceptar de nuevo si la versión quedó atrás", () => {
    expect(
      portfolioConsentErrorMessage("2026-10-20T10:00:00Z", "vieja"),
    ).toMatch(/de nuevo/i);
  });
});

describe("confirmación de borrado", () => {
  it("solo acepta BORRAR exacto (con espacios alrededor)", () => {
    expect(isDeleteConfirmationValid(DELETE_CONFIRMATION_WORD)).toBe(true);
    expect(isDeleteConfirmationValid("  BORRAR  ")).toBe(true);
    expect(isDeleteConfirmationValid("borrar")).toBe(false);
    expect(isDeleteConfirmationValid("BORRAR TODO")).toBe(false);
    expect(isDeleteConfirmationValid(null)).toBe(false);
  });
});

describe("ajustes de alertas según plan", () => {
  it("Gratis no puede encender alertas automáticas", () => {
    const result = validatePortfolioAlertSettings(
      { autoAlerts: true, minRelevance: "0.5", alertChannel: "email" },
      { plan: "free", hasConsent: true },
    );
    expect(result.ok).toBe(false);
  });

  it("Pro puede encenderlas solo con consentimiento", () => {
    const withoutConsent = validatePortfolioAlertSettings(
      { autoAlerts: true, minRelevance: "0.5", alertChannel: "email" },
      { plan: "pro", hasConsent: false },
    );
    expect(withoutConsent.ok).toBe(false);

    const withConsent = validatePortfolioAlertSettings(
      { autoAlerts: true, minRelevance: "0.5", alertChannel: "email" },
      { plan: "pro", hasConsent: true },
    );
    expect(withConsent.ok).toBe(true);
    if (withConsent.ok) {
      expect(withConsent.values).toEqual({
        autoAlerts: true,
        minRelevance: 0.5,
        alertChannel: "email",
      });
    }
  });

  it("Gratis no puede elegir Telegram; Pro sí", () => {
    expect(
      validatePortfolioAlertSettings(
        { autoAlerts: false, minRelevance: 0.5, alertChannel: "telegram" },
        { plan: "free", hasConsent: false },
      ).ok,
    ).toBe(false);
    expect(
      validatePortfolioAlertSettings(
        { autoAlerts: false, minRelevance: 0.5, alertChannel: "both" },
        { plan: "pro", hasConsent: false },
      ).ok,
    ).toBe(true);
  });

  it("rechaza umbrales fuera de 0–1 y canales inválidos", () => {
    expect(
      validatePortfolioAlertSettings(
        { autoAlerts: false, minRelevance: 1.4, alertChannel: "email" },
        { plan: "pro", hasConsent: true },
      ).ok,
    ).toBe(false);
    expect(
      validatePortfolioAlertSettings(
        { autoAlerts: false, minRelevance: 0.5, alertChannel: "sms" },
        { plan: "pro", hasConsent: true },
      ).ok,
    ).toBe(false);
  });
});

describe("server action: consentimiento", () => {
  it("falla si el checkbox no viene marcado y no escribe nada", async () => {
    const result = await grantPortfolioConsent({}, formData({}));
    expect(result.error).toMatch(/marca la casilla/i);
    expect(state.calls).toHaveLength(0);
  });

  it("guarda consent_at y la versión vigente cuando el checkbox está marcado", async () => {
    const result = await grantPortfolioConsent({}, formData({ consent: "on" }));
    expect(result.success).toMatch(/consentimiento guardado/i);

    const upsert = state.calls.find((call) => call.op === "upsert");
    expect(upsert?.table).toBe("user_portfolio_settings");
    expect(upsert?.values?.user_id).toBe("user-1");
    expect(typeof upsert?.values?.consent_at).toBe("string");
    expect(Number.isFinite(Date.parse(String(upsert?.values?.consent_at)))).toBe(true);
    expect(upsert?.values?.consent_version).toBe(PORTFOLIO_CONSENT_VERSION);
    expect(upsert?.options).toEqual({ onConflict: "user_id" });
  });

  it("está apagada sin MY_PORTFOLIO_ENABLED=true", async () => {
    vi.stubEnv("MY_PORTFOLIO_ENABLED", "false");
    const result = await grantPortfolioConsent({}, formData({ consent: "on" }));
    expect(result.error).toMatch(/no está disponible/i);
    expect(state.calls).toHaveLength(0);
  });

  it("no guarda si Supabase devuelve error", async () => {
    state.upsertError = { message: "boom" };
    const result = await grantPortfolioConsent({}, formData({ consent: "on" }));
    expect(result.error).toMatch(/no pudimos guardar/i);
  });
});

describe("server action: retiro del consentimiento", () => {
  it("llama a delete_my_portfolio y deja consent_at y versión en null", async () => {
    state.rpcData = 5;
    state.settings = { consent_at: "2026-10-01T00:00:00Z", auto_alerts: true };
    const result = await withdrawPortfolioConsent({}, formData({}));
    expect(result.success).toMatch(/consentimiento retirado/i);

    // Retirar el consentimiento borra la cartera (derecho de supresión).
    expect(state.rpcCalls).toEqual([{ name: "delete_my_portfolio" }]);

    const reset = state.calls.find((call) => call.op === "upsert");
    expect(reset?.table).toBe("user_portfolio_settings");
    expect(reset?.values?.consent_at).toBeNull();
    expect(reset?.values?.consent_version).toBeNull();
    expect(reset?.values?.auto_alerts).toBe(false);
  });

  it("si la RPC falla no deja el consentimiento retirado", async () => {
    state.rpcError = { message: "rpc failed" };
    const result = await withdrawPortfolioConsent({}, formData({}));
    expect(result.error).toMatch(/no pudimos retirar/i);
    expect(state.calls).toHaveLength(0);
  });

  it("está apagada sin el flag", async () => {
    vi.stubEnv("MY_PORTFOLIO_ENABLED", "false");
    const result = await withdrawPortfolioConsent({}, formData({}));
    expect(result.error).toMatch(/no está disponible/i);
    expect(state.calls).toHaveLength(0);
  });
});

describe("server action: borrar mi cartera", () => {
  it("con confirmación inválida no llama a la RPC", async () => {
    const result = await deleteMyPortfolio({}, formData({ confirm: "borrar" }));
    expect(result.error).toMatch(/BORRAR/);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("sin confirmación tampoco ejecuta el borrado", async () => {
    const result = await deleteMyPortfolio({}, formData({}));
    expect(result.error).toMatch(/BORRAR/);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("con BORRAR llama a delete_my_portfolio y reporta el total", async () => {
    state.rpcData = 4;
    const result = await deleteMyPortfolio({}, formData({ confirm: "BORRAR" }));
    expect(state.rpcCalls).toEqual([{ name: "delete_my_portfolio" }]);
    expect(result.success).toMatch(/4 registros/);
  });

  it("propaga el error de la RPC sin decir que borró", async () => {
    state.rpcError = { message: "rpc failed" };
    const result = await deleteMyPortfolio({}, formData({ confirm: "BORRAR" }));
    expect(result.error).toMatch(/no pudimos borrar/i);
    expect(result.success).toBeUndefined();
  });

  it("está apagada sin el flag", async () => {
    vi.stubEnv("MY_PORTFOLIO_ENABLED", "false");
    const result = await deleteMyPortfolio({}, formData({ confirm: "BORRAR" }));
    expect(result.error).toMatch(/no está disponible/i);
    expect(state.rpcCalls).toHaveLength(0);
  });
});

describe("server action: preferencias de alertas", () => {
  it("guarda umbral y canal cuando hay consentimiento vigente", async () => {
    state.settings = {
      consent_at: "2026-10-01T00:00:00Z",
      consent_version: PORTFOLIO_CONSENT_VERSION,
    };
    const result = await updatePortfolioAlerts(
      {},
      formData({ auto_alerts: "on", min_relevance: "0.7", alert_channel: "both" }),
    );
    expect(result.success).toMatch(/preferencias/i);

    const upsert = state.calls.find((call) => call.op === "upsert");
    expect(upsert?.values).toMatchObject({
      user_id: "user-1",
      auto_alerts: true,
      min_relevance: 0.7,
      alert_channel: "both",
    });
  });

  it("no enciende alertas sin consentimiento", async () => {
    state.settings = null;
    const result = await updatePortfolioAlerts(
      {},
      formData({ auto_alerts: "on", min_relevance: "0.5", alert_channel: "email" }),
    );
    expect(result.error).toMatch(/consentimiento/i);
    expect(state.calls).toHaveLength(0);
  });

  it("una versión vieja obliga a aceptar de nuevo", async () => {
    state.settings = {
      consent_at: "2026-10-01T00:00:00Z",
      consent_version: "2026-10-01.v0",
    };
    const result = await updatePortfolioAlerts(
      {},
      formData({ auto_alerts: "on", min_relevance: "0.5", alert_channel: "email" }),
    );
    expect(result.error).toMatch(/consentimiento/i);
    expect(state.calls).toHaveLength(0);
  });

  it("Gratis no puede activar auto_alerts aunque tenga consentimiento", async () => {
    state.profile = { plan: "free", trial_ends_at: null };
    state.settings = {
      consent_at: "2026-10-01T00:00:00Z",
      consent_version: PORTFOLIO_CONSENT_VERSION,
    };
    const result = await updatePortfolioAlerts(
      {},
      formData({ auto_alerts: "on", min_relevance: "0.5", alert_channel: "email" }),
    );
    expect(result.error).toMatch(/no incluye alertas automáticas/i);
    expect(state.calls).toHaveLength(0);
  });
});
