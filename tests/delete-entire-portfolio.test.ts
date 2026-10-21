import { beforeEach, describe, expect, it, vi } from "vitest";

/** M3 (F77): el boton Borrar de /compare usa delete_my_portfolio(). */
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { deleteEntirePortfolio } from "@/app/actions/holdings";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: mocks.from,
  });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.rpc.mockResolvedValue({ data: 3, error: null });
});

describe("deleteEntirePortfolio", () => {
  it("llama a delete_my_portfolio y no borra tabla por tabla", async () => {
    const result = await deleteEntirePortfolio();

    expect(result.error).toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith("delete_my_portfolio");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/compare");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/mi-portafolio");
  });

  it("sin sesion no borra nada", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const result = await deleteEntirePortfolio();

    expect(result.error).toMatch(/autenticado/i);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("si la RPC falla devuelve un error generico", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "permission denied for table x" } });

    const result = await deleteEntirePortfolio();

    expect(result.error).toBe("No pudimos borrar tu cartera. Intenta de nuevo.");
  });
});
