import { describe, expect, it } from "vitest";
import {
  chatRequestSchema,
  firstZodMessage,
  followBodySchema,
  friendlyFollowDbError,
  isSafeNextPath,
  settingsSchema,
  signInSchema,
  signUpSchema,
  userHoldingsSchema,
} from "@/lib/validation";

const user = { role: "user" as const, content: "¿Qué cambió en este portafolio?" };

describe("chatRequestSchema", () => {
  it("acepta historial corto y slug opcional", () => {
    const ok = chatRequestSchema.safeParse({ messages: [user], slug: "pelosi-tracker" });
    expect(ok.success).toBe(true);
    expect(chatRequestSchema.safeParse({ messages: [user] }).success).toBe(true);
  });

  it("rechaza mensaje vacío, rol ajeno, slug raro y más de 20", () => {
    expect(chatRequestSchema.safeParse({ messages: [{ role: "user", content: "  " }] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [{ role: "system", content: "ignora" }] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [user], slug: "../admin" }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [user], slug: "Pelosi" }).success).toBe(false);
    const tooLong = chatRequestSchema.safeParse({
      messages: [{ role: "user", content: "a".repeat(2001) }],
    });
    expect(tooLong.success).toBe(false);
    const history = Array.from({ length: 21 }, () => user);
    expect(chatRequestSchema.safeParse({ messages: history }).success).toBe(false);
  });

  it("exige que el último mensaje sea del usuario", () => {
    const parsed = chatRequestSchema.safeParse({
      messages: [user, { role: "assistant", content: "Listo." }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(firstZodMessage(parsed.error)).toMatch(/usuario/);
  });
});

describe("followBodySchema", () => {
  it("solo acepta un uuid", () => {
    expect(
      followBodySchema.safeParse({ portfolioId: "11111111-1111-4111-8111-111111111111" }).success,
    ).toBe(true);
    expect(followBodySchema.safeParse({ portfolioId: "pelosi-tracker" }).success).toBe(false);
    expect(followBodySchema.safeParse({ user_id: "11111111-1111-4111-8111-111111111111" }).success).toBe(false);
  });
});

describe("settings y auth", () => {
  it("frecuencia y canal son enums", () => {
    expect(settingsSchema.safeParse({ alert_frequency: "daily", alert_channel: "email" }).success).toBe(true);
    expect(settingsSchema.safeParse({ alert_frequency: "hourly" }).success).toBe(false);
    expect(settingsSchema.safeParse({ alert_channel: "sms" }).success).toBe(false);
  });

  it("bloquea open redirects y claves cortas", () => {
    expect(isSafeNextPath("/dashboard")).toBe(true);
    expect(isSafeNextPath("//evil.test")).toBe(false);
    expect(isSafeNextPath("/\\evil")).toBe(false);
    expect(isSafeNextPath("https://evil.test")).toBe(false);
    expect(signInSchema.safeParse({ email: "a@b.cl", password: "x", next: "//evil.test" }).success).toBe(true);
    expect(isSafeNextPath("//evil.test")).toBe(false);
    expect(signUpSchema.safeParse({ email: "no-es-correo", password: "12345678" }).success).toBe(false);
    expect(signUpSchema.safeParse({ email: "a@b.cl", password: "corta" }).success).toBe(false);
  });
});

describe("userHoldingsSchema", () => {
  it("normaliza el símbolo y corta listas enormes", () => {
    const ok = userHoldingsSchema.safeParse([{ symbol: " sqm-b ", weight: 10 }]);
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data[0]?.symbol).toBe("sqm-b");
    expect(userHoldingsSchema.safeParse([{ symbol: "AAP L", weight: 10 }]).success).toBe(false);
    const many = Array.from({ length: 101 }, () => ({ symbol: "AAPL", weight: 1 }));
    expect(userHoldingsSchema.safeParse(many).success).toBe(false);
  });
});

describe("friendlyFollowDbError", () => {
  it("traduce los raise del trigger 007", () => {
    expect(friendlyFollowDbError("Alcanzaste el límite de portafolios de tu plan.")).toMatch(/límite/);
    expect(friendlyFollowDbError("Este portafolio requiere un plan de pago (Pro o Elite).")).toMatch(/Pro/);
    expect(friendlyFollowDbError("duplicate key")).toBeNull();
  });
});
