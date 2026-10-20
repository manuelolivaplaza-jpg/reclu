import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  getUser: vi.fn(),
  proxyGetUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mocks.proxyGetUser },
  })),
}));

import { NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin";
import { requireAdmin } from "@/lib/admin-guard";
import { proxy } from "@/proxy";

const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

function setAdminEmails(value: string | undefined) {
  if (value === undefined) {
    delete process.env.ADMIN_EMAILS;
  } else {
    process.env.ADMIN_EMAILS = value;
  }
}

beforeEach(() => {
  mocks.notFound.mockClear();
  mocks.getUser.mockReset();
  mocks.proxyGetUser.mockReset();
});

afterEach(() => {
  setAdminEmails(ORIGINAL_ADMIN_EMAILS);
});

describe("isAdmin", () => {
  it("falla cerrado si ADMIN_EMAILS no está definido", () => {
    setAdminEmails(undefined);
    expect(isAdmin("admin@reclu.cl")).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it("falla cerrado si ADMIN_EMAILS está vacío", () => {
    setAdminEmails("");
    expect(isAdmin("admin@reclu.cl")).toBe(false);
  });

  it("ignora mayúsculas y espacios en la lista y en el email", () => {
    setAdminEmails(" Admin@Reclu.CL , otro@reclu.cl ");
    expect(isAdmin("admin@reclu.cl")).toBe(true);
    expect(isAdmin("ADMIN@RECLU.CL")).toBe(true);
    expect(isAdmin("  Otro@Reclu.cl  ")).toBe(true);
  });

  it("rechaza un email que no está en la lista", () => {
    setAdminEmails("admin@reclu.cl");
    expect(isAdmin("intruso@reclu.cl")).toBe(false);
    expect(isAdmin("")).toBe(false);
  });
});

describe("requireAdmin", () => {
  it("llama notFound si no hay usuario", async () => {
    setAdminEmails("admin@reclu.cl");
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("llama notFound si el usuario no es admin", async () => {
    setAdminEmails("admin@reclu.cl");
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "intruso@reclu.cl" } },
    });

    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("devuelve el usuario si es admin", async () => {
    setAdminEmails("admin@reclu.cl");
    const user = { id: "u1", email: "admin@reclu.cl" };
    mocks.getUser.mockResolvedValue({ data: { user } });

    await expect(requireAdmin()).resolves.toBe(user);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});

describe("proxy", () => {
  it("redirige /admin a /login sin sesión", async () => {
    mocks.proxyGetUser.mockResolvedValue({ data: { user: null } });
    const request = new NextRequest("http://localhost/admin");

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?next=%2Fadmin",
    );
  });

  it("redirige /admin/usuarios a /login conservando next", async () => {
    mocks.proxyGetUser.mockResolvedValue({ data: { user: null } });
    const request = new NextRequest("http://localhost/admin/usuarios?page=2");

    const response = await proxy(request);

    expect(response.headers.get("location")).toBe(
      "http://localhost/login?page=2&next=%2Fadmin%2Fusuarios",
    );
  });
});
