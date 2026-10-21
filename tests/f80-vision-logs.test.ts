import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F80 — punto 8: no se loguean cuerpos de respuesta del proveedor.
 *
 * Sin OpenRouter real: se intercepta `fetch` para simular una respuesta de
 * error con cuerpo interno. El log debe traer SOLO el status y el código: el
 * cuerpo de la respuesta (que puede traer detalle interno del proveedor) no
 * puede aparecer en los logs.
 */
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  sessionFrom: vi.fn(),
  enforceSignedInQuota: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.sessionFrom,
  })),
}));

vi.mock("@/lib/chat-guard", () => ({
  enforceSignedInQuota: mocks.enforceSignedInQuota,
}));

import { callVisionModel } from "@/lib/portfolio-vision";
import { POST } from "@/app/api/holdings/image/route";
import { PORTFOLIO_CONSENT_VERSION } from "@/lib/portfolio-consent";

const USER_ID = "user-1";
/** PNG mínimo: 89 50 4E 47 0D 0A 1A 0A. */
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Cuerpo interno del proveedor que NO debe terminar en los logs. */
const BODY_SECRETO =
  '{"error":{"code":"429","message":"rate limit exceeded for tenant acme-corp key sk-live-9999"}}';

let consentRow: { data: unknown; error: null | { message: string; code?: string } };

const fetchMock = vi.fn();
let consoleWarn: ReturnType<typeof vi.spyOn>;

function postFile(): Promise<Response> {
  const form = new FormData();
  form.append("file", new File([PNG_BYTES], "captura.png", { type: "image/png" }));
  return POST(
    new Request("http://localhost/api/holdings/image", {
      method: "POST",
      body: form,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PORTFOLIO_IMAGE_IMPORT_ENABLED = "true";
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_VISION_MODEL = "google/gemini-2.5-flash";

  consentRow = {
    data: {
      consent_at: "2026-10-01T00:00:00Z",
      consent_version: PORTFOLIO_CONSENT_VERSION,
    },
    error: null,
  };

  mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  mocks.sessionFrom.mockImplementation(() => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => consentRow }) }),
  }));
  mocks.enforceSignedInQuota.mockResolvedValue({
    ok: true,
    headers: { "X-Chat-Plan": "free" },
  });

  fetchMock.mockResolvedValue(
    new Response(BODY_SECRETO, {
      status: 429,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  consoleWarn.mockRestore();
  delete process.env.PORTFOLIO_IMAGE_IMPORT_ENABLED;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_VISION_MODEL;
});

/** Todo lo registrado en consola, en texto plano. */
function logged(): string {
  return consoleWarn.mock.calls
    .map((call: unknown[]) =>
      call.map((value: unknown) => String(value)).join(" "),
    )
    .join("\n");
}

describe("F80: el cliente de visión no loguea el cuerpo del proveedor", () => {
  it("loguea solo el status y el código, nunca el cuerpo", async () => {
    const result = await callVisionModel({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      base64: "aGk=",
      mime: "image/png",
    });

    expect(result.ok).toBe(false);

    const texto = logged();
    expect(texto).toContain("429");
    // El cuerpo crudo NO aparece en el log.
    expect(texto).not.toContain("rate limit exceeded");
    expect(texto).not.toContain("sk-live-9999");
    expect(texto).not.toContain("acme-corp");
    expect(texto).not.toContain(BODY_SECRETO);
  });

  it("la respuesta al usuario es genérica y no trae el cuerpo", async () => {
    const result = await callVisionModel({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      base64: "aGk=",
      mime: "image/png",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain("rate limit");
      expect(result.error).not.toContain("sk-live-9999");
    }
  });

  it("un cuerpo no JSON no rompe el log", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));

    const result = await callVisionModel({
      apiKey: "test-key",
      model: "google/gemini-2.5-flash",
      base64: "aGk=",
      mime: "image/png",
    });

    expect(result.ok).toBe(false);
    const texto = logged();
    expect(texto).toContain("500");
    expect(texto).not.toContain("boom");
  });
});

describe("F80: la ruta de imagen no loguea el mensaje crudo de Supabase", () => {
  it("loguea solo el código del error", async () => {
    consentRow = {
      data: null,
      error: {
        message:
          'relation "user_portfolio_settings" does not exist on schema public',
        code: "42P01",
      },
    };

    const res = await postFile();

    expect(res.status).toBe(503);

    const texto = logged();
    expect(texto).toContain("42P01");
    expect(texto).not.toContain("user_portfolio_settings");
    expect(texto).not.toContain("does not exist");
  });

  it("la respuesta al usuario es genérica", async () => {
    consentRow = {
      data: null,
      error: {
        message: 'relation "user_portfolio_settings" does not exist',
        code: "42P01",
      },
    };

    const res = await postFile();
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(503);
    expect(body.error).not.toContain("user_portfolio_settings");
    expect(body.error).toMatch(/consentimiento/i);
  });
});
