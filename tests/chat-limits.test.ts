import { describe, expect, it } from "vitest";

import {
  DAY_MS,
  chatQuotaDecision,
  clientIpFromHeaders,
  formatTimeUntilReset,
  hashIp,
  normalizeChatPlan,
  planChatLimit,
} from "@/lib/chat-limits";

const NOW = Date.parse("2026-10-18T12:00:00.000Z");

describe("normalizeChatPlan", () => {
  it("acepta solo planes válidos", () => {
    expect(normalizeChatPlan("free")).toBe("free");
    expect(normalizeChatPlan("pro")).toBe("pro");
    expect(normalizeChatPlan("elite")).toBe("elite");
  });

  it("cae a free con valores raros o nulos", () => {
    expect(normalizeChatPlan("elite ")).toBe("free");
    expect(normalizeChatPlan("PRO")).toBe("free");
    expect(normalizeChatPlan("admin")).toBe("free");
    expect(normalizeChatPlan(null)).toBe("free");
    expect(normalizeChatPlan(undefined)).toBe("free");
  });
});

describe("planChatLimit", () => {
  it("free 5, pro 50, elite 500", () => {
    expect(planChatLimit("free")).toBe(5);
    expect(planChatLimit("pro")).toBe(50);
    expect(planChatLimit("elite")).toBe(500);
  });
});

describe("chatQuotaDecision", () => {
  it("elite nunca cae en el límite gratis", () => {
    const d = chatQuotaDecision({
      plan: "elite",
      used: 5,
      resetAt: NOW - 1000,
      now: NOW,
    });
    expect(d.plan).toBe("elite");
    expect(d.limit).toBe(500);
    expect(d.allowed).toBe(true);
    expect(d.stale).toBe(false);
  });

  it("pro respeta su ventana semanal y su límite", () => {
    const d = chatQuotaDecision({
      plan: "pro",
      used: 50,
      resetAt: NOW - DAY_MS,
      now: NOW,
    });
    expect(d.allowed).toBe(false);
    expect(d.remaining).toBe(0);
    expect(d.stale).toBe(false);
  });

  it("free con contador vencido se renueva y permite preguntar", () => {
    const d = chatQuotaDecision({
      plan: "free",
      used: 5,
      resetAt: NOW - DAY_MS - 1,
      now: NOW,
    });
    expect(d.stale).toBe(true);
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(5);
    expect(d.nextResetAt).toBe(NOW + DAY_MS);
  });

  it("free en el límite bloquea y calcula el próximo reset", () => {
    const resetAt = NOW - 2 * 60 * 60 * 1000;
    const d = chatQuotaDecision({ plan: "free", used: 5, resetAt, now: NOW });
    expect(d.allowed).toBe(false);
    expect(d.remaining).toBe(0);
    expect(d.nextResetAt).toBe(resetAt + DAY_MS);
  });

  it("trata resetAt inválido como vencido", () => {
    const d = chatQuotaDecision({ plan: "free", used: 9, resetAt: "no-es-fecha", now: NOW });
    expect(d.stale).toBe(true);
    expect(d.allowed).toBe(true);
  });

  it("plan desconocido recibe límite de free", () => {
    const d = chatQuotaDecision({ plan: "admin", used: 5, resetAt: NOW, now: NOW });
    expect(d.plan).toBe("free");
    expect(d.allowed).toBe(false);
  });
});

describe("hashIp", () => {
  it("es determinista y cambia con la sal", () => {
    const a = hashIp("203.0.113.9");
    const b = hashIp("203.0.113.9");
    const c = hashIp("203.0.113.9", "sal-secreta");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{40}$/);
  });

  it("no revela la IP original", () => {
    expect(hashIp("203.0.113.9")).not.toContain("203.0.113.9");
  });
});

describe("clientIpFromHeaders", () => {
  it("usa el primer valor de x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.5");
  });

  it("cae a x-real-ip y luego a unknown", () => {
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe(
      "198.51.100.2",
    );
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});

describe("formatTimeUntilReset", () => {
  it("formatea minutos, horas y días en español", () => {
    expect(formatTimeUntilReset(NOW - 1, NOW)).toBe("ahora");
    expect(formatTimeUntilReset(NOW + 5 * 60 * 1000, NOW)).toBe("en 5 minutos");
    expect(formatTimeUntilReset(NOW + 3 * 60 * 60 * 1000, NOW)).toBe("en 3 h");
    expect(formatTimeUntilReset(NOW + 26 * 60 * 60 * 1000, NOW)).toBe("en 1 días y 2 h");
  });
});

describe("coherencia con la migración 006/007", () => {
  it("pro 50/semana, elite 500/semana, free 5/día", () => {
    expect(chatQuotaDecision({ plan: "pro", used: 0, resetAt: NOW, now: NOW }).limit).toBe(50);
    expect(chatQuotaDecision({ plan: "elite", used: 0, resetAt: NOW, now: NOW }).limit).toBe(500);
    expect(chatQuotaDecision({ plan: "free", used: 0, resetAt: NOW, now: NOW }).limit).toBe(5);
  });
});
