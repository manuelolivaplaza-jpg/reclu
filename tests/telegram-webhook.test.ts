import { afterEach, describe, expect, it, vi } from "vitest";

// El webhook usa createServiceClient solo tras autenticar; con secreto
// correcto y un /start sin código no llega a Supabase, pero lo mockeamos
// para que ningún test pueda tocar Supabase real.
vi.mock("@/lib/supabase-admin", () => ({
  createServiceClient: vi.fn(() => null),
}));

const SECRET = "test-webhook-secret";

function makeRequest(headers: Record<string, string>, body: unknown) {
  return new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function post(headers: Record<string, string>, body: unknown) {
  const { POST } = await import("@/app/api/telegram/webhook/route");
  return POST(makeRequest(headers, body));
}

describe("POST /api/telegram/webhook (M4)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("sin secreto configurado => 503 (falla cerrado)", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const res = await post(
      { "x-telegram-bot-api-secret-token": SECRET },
      { message: { text: "/start abc123", chat: { id: 1 } } },
    );
    expect(res.status).toBe(503);
  });

  it("secreto incorrecto => 401", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    const res = await post(
      { "x-telegram-bot-api-secret-token": "otro-secreto" },
      { message: { text: "/start abc123", chat: { id: 1 } } },
    );
    expect(res.status).toBe(401);
  });

  it("header ausente => 401", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    const res = await post({}, { message: { text: "/start abc123", chat: { id: 1 } } });
    expect(res.status).toBe(401);
  });

  it("secreto correcto => 200 y procesa el update", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    // /start sin código: responde sin llegar a Supabase.
    const res = await post(
      { "x-telegram-bot-api-secret-token": SECRET },
      { message: { text: "/start", chat: { id: 42 } } },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
