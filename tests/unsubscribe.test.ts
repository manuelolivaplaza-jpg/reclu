import { beforeEach, describe, expect, it, vi } from "vitest";

// Nunca tocar Supabase real: el route handler usa este cliente mockeado.
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  createServiceClient: mocks.createServiceClient,
}));

import { GET, POST } from "@/app/api/unsubscribe/route";

const TOKEN = "11111111-1111-4111-8111-111111111111";
const BASE = "http://localhost/api/unsubscribe";

function get(query = ""): Promise<Response> {
  return GET(new Request(`${BASE}${query}`));
}

function postForm(body: Record<string, string>): Promise<Response> {
  return POST(
    new Request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    }),
  );
}

function postOneClick(token: string): Promise<Response> {
  return POST(
    new Request(`${BASE}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    }),
  );
}

describe("/api/unsubscribe (M5): confirmación por GET, baja solo por POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.createServiceClient.mockReturnValue({ rpc: mocks.rpc });
  });

  it("GET con token válido solo redirige a la confirmación y no da de baja", async () => {
    const res = await get(`?token=${TOKEN}`);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`http://localhost/baja?token=${TOKEN}`);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("GET sin token válido redirige a /baja sin dar de baja", async () => {
    const res = await get(`?token=no-es-uuid`);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/baja");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("POST del formulario manda el token en el cuerpo y llama la rpc", async () => {
    const res = await postForm({ token: TOKEN, confirm: "1" });

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/baja?ok=1");
    expect(mocks.rpc).toHaveBeenCalledWith("unsubscribe_by_token", { p_token: TOKEN });
  });

  it("POST One-Click usa el token del query y responde 200", async () => {
    const res = await postOneClick(TOKEN);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("unsubscribe_by_token", { p_token: TOKEN });
  });

  it("token inválido => mensaje genérico y no llama la rpc", async () => {
    const res = await postForm({ token: "a1", confirm: "1" });

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/baja?error=1");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("token vencido o ya usado (rpc false) => mensaje genérico", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    const res = await postForm({ token: TOKEN, confirm: "1" });

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost/baja?error=1");
    expect(mocks.rpc).toHaveBeenCalledWith("unsubscribe_by_token", { p_token: TOKEN });
  });

  it("One-Click con rpc false => JSON genérico", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    const res = await postOneClick(TOKEN);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/último correo/);
    expect(mocks.rpc).toHaveBeenCalledWith("unsubscribe_by_token", { p_token: TOKEN });
  });
});
