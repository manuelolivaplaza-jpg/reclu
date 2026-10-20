import { afterEach, describe, expect, it, vi } from "vitest";

// Nunca tocar Supabase real: mockeamos el cliente server.
const signUpMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signUp: signUpMock },
  })),
}));

// cookies() requiere contexto de request en Next; fuera de uno falla.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

function makeForm(email: string, password: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  return fd;
}

async function callSignUp(email: string, password: string) {
  const { signUp } = await import("@/app/actions/auth");
  return signUp({}, makeForm(email, password));
}

describe("signUp (M9): sin enumeración de usuarios", () => {
  afterEach(() => {
    signUpMock.mockReset();
    vi.unstubAllEnvs();
  });

  it('"User already registered" devuelve el mensaje genérico, no el error crudo', async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { status: 400, message: "User already registered" },
    });
    const state = await callSignUp("ya@existe.cl", "password123");
    expect(state.error).toBe("Si el correo es válido, te enviamos un enlace para continuar.");
    expect(state.error).not.toContain("already registered");
  });

  it("otro error de Supabase también devuelve el mensaje genérico", async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { status: 422, message: "Password should be at least 6 characters" },
    });
    const state = await callSignUp("nuevo@correo.cl", "password123");
    expect(state.error).toBe("Si el correo es válido, te enviamos un enlace para continuar.");
  });

  it("errores de validación Zod se siguen mostrando", async () => {
    const state = await callSignUp("no-es-correo", "password123");
    expect(state.error).toBeTruthy();
    expect(state.error).not.toBe("Si el correo es válido, te enviamos un enlace para continuar.");
  });

  it("contraseña corta muestra el error de Zod", async () => {
    const state = await callSignUp("a@b.cl", "corta");
    expect(state.error).toBeTruthy();
    expect(state.error).not.toBe("Si el correo es válido, te enviamos un enlace para continuar.");
  });
});
