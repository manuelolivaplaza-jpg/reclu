import { beforeEach, describe, expect, it, vi } from "vitest";

// Sin Supabase real: solo verificamos que la acción use la RPC de la 047.
const mocks = vi.hoisted(() => {
  const single = vi.fn();
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  return {
    getUser: vi.fn(),
    rpc: vi.fn(),
    from: vi.fn(() => ({ select })),
    select,
    eq,
    single,
    revalidatePath: vi.fn(),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { prepareTelegramLink } from "@/app/actions/settings";

describe("prepareTelegramLink (M10): escribe el código vía RPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.single.mockResolvedValue({
      data: { plan: "pro", trial_ends_at: null },
    });
  });

  it("sin sesión no llama a la RPC", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const state = await prepareTelegramLink({}, new FormData());

    expect(state.error).toBe("No autenticado.");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("plan gratis no llama a la RPC", async () => {
    mocks.single.mockResolvedValue({
      data: { plan: "free", trial_ends_at: null },
    });

    const state = await prepareTelegramLink({}, new FormData());

    expect(state.error).toContain("Telegram está disponible");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("plan Pro llama create_telegram_link_code y devuelve éxito", async () => {
    mocks.rpc.mockResolvedValue({
      data: "0123456789abcdef0123456789abcdef",
      error: null,
    });

    const state = await prepareTelegramLink({}, new FormData());

    expect(mocks.rpc).toHaveBeenCalledWith("create_telegram_link_code");
    expect(state.success).toBeTruthy();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("si la RPC falla, devuelve un error genérico y no revalida", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "No autenticado." },
    });

    const state = await prepareTelegramLink({}, new FormData());

    expect(state.error).toBe("No pudimos generar el enlace.");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
