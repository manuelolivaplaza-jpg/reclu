import { describe, it, expect } from "vitest";
import { routeAlert, normalizeFrequency, normalizeChannel, channelLabel } from "@/lib/alert-routing";

describe("normalizeFrequency", () => {
  it("gratis solo puede elegir daily/weekly aunque pida realtime", () => {
    expect(normalizeFrequency("free", "realtime")).toBe("daily");
    expect(normalizeFrequency("free", "weekly")).toBe("weekly");
    expect(normalizeFrequency("free", "daily")).toBe("daily");
  });

  it("pro y elite respetan realtime", () => {
    expect(normalizeFrequency("pro", "realtime")).toBe("realtime");
    expect(normalizeFrequency("elite", "realtime")).toBe("realtime");
  });

  it("durante la prueba el gratis puede usar realtime", () => {
    expect(normalizeFrequency("free", "realtime", "2999-01-01T00:00:00Z")).toBe("realtime");
  });

  it("valor basura cae a daily", () => {
    expect(normalizeFrequency("pro", "inmediato")).toBe("daily");
    expect(normalizeFrequency("free", "")).toBe("daily");
  });
});

describe("normalizeChannel", () => {
  it("gratis nunca obtiene telegram", () => {
    expect(normalizeChannel("free", "telegram")).toBe("email");
    expect(normalizeChannel("free", "both")).toBe("email");
  });

  it("pro/elite pueden elegir telegram o both", () => {
    expect(normalizeChannel("pro", "telegram")).toBe("telegram");
    expect(normalizeChannel("elite", "both")).toBe("both");
    expect(normalizeChannel("pro", "email")).toBe("email");
    expect(normalizeChannel("pro", null)).toBe("email");
  });
});

describe("routeAlert — modo instant", () => {
  it("pro con realtime recibe correo", () => {
    const r = routeAlert({ plan: "pro", alertFrequency: "realtime" });
    expect(r.email).toBe(true);
    expect(r.telegram).toBe(false); // sin chat_id vinculado
  });

  it("elite con realtime + telegram vinculado recibe ambos canales", () => {
    const r = routeAlert({
      plan: "elite",
      alertFrequency: "realtime",
      alertChannel: "both",
      telegramLinked: true,
    });
    expect(r.email).toBe(true);
    expect(r.telegram).toBe(true);
  });

  it("elite degradado a daily no recibe instantáneas", () => {
    const r = routeAlert({ plan: "elite", alertFrequency: "daily", mode: "instant" });
    expect(r.email).toBe(false);
    expect(r.telegram).toBe(false);
  });

  it("gratis con realtime (herencia) se enruta como daily", () => {
    const r = routeAlert({ plan: "free", alertFrequency: "realtime", mode: "instant" });
    expect(r.email).toBe(false);
    expect(r.frequency).toBe("daily");
  });

  it("gratis en prueba con realtime recibe instantáneas", () => {
    const r = routeAlert({
      plan: "free",
      trialEndsAt: "2999-01-01T00:00:00Z",
      alertFrequency: "realtime",
      mode: "instant",
    });
    expect(r.email).toBe(true);
  });

  it("usuario con baja de correo no recibe email aunque sea pro realtime", () => {
    const r = routeAlert({
      plan: "pro",
      alertFrequency: "realtime",
      emailUnsubscribed: true,
    });
    expect(r.email).toBe(false);
  });

  it("telegram sin chat_id vinculado no se envía", () => {
    const r = routeAlert({
      plan: "pro",
      alertFrequency: "realtime",
      alertChannel: "telegram",
      telegramLinked: false,
    });
    expect(r.telegram).toBe(false);
    expect(r.email).toBe(true); // el correo sigue
  });
});

describe("routeAlert — modo daily (digest)", () => {
  it("daily/weekly users reciben el digest por correo", () => {
    expect(routeAlert({ plan: "free", alertFrequency: "daily", mode: "daily" }).email).toBe(true);
    expect(routeAlert({ plan: "pro", alertFrequency: "weekly", mode: "daily" }).email).toBe(true);
  });

  it("quien ya recibió realtime igual recibe el digest diario de lo nuevo", () => {
    const r = routeAlert({ plan: "pro", alertFrequency: "realtime", mode: "daily" });
    expect(r.email).toBe(true); // el digest agrupa lo no entregado
    expect(r.telegram).toBe(false); // realtime ya fue notificado por telegram
  });

  it("baja de correo bloquea el digest", () => {
    const r = routeAlert({
      plan: "free",
      alertFrequency: "daily",
      mode: "daily",
      emailUnsubscribed: true,
    });
    expect(r.email).toBe(false);
  });
});

describe("routeAlert — modo weekly (resumen de los grandes)", () => {
  it("todos los registrados con weekly_digest reciben el resumen", () => {
    expect(routeAlert({ plan: "free", alertFrequency: "daily", mode: "weekly" }).email).toBe(true);
    expect(routeAlert({ plan: "pro", alertFrequency: "realtime", mode: "weekly" }).email).toBe(true);
    expect(routeAlert({ plan: "elite", alertFrequency: "weekly", mode: "weekly" }).email).toBe(true);
  });

  it("la baja de correo también bloquea el resumen semanal", () => {
    const r = routeAlert({
      plan: "pro",
      alertFrequency: "daily",
      mode: "weekly",
      emailUnsubscribed: true,
    });
    expect(r.email).toBe(false);
  });
});

describe("channelLabel", () => {
  it("rótulos en español", () => {
    expect(channelLabel("email")).toBe("Correo");
    expect(channelLabel("telegram")).toBe("Telegram");
    expect(channelLabel("both")).toBe("Correo y Telegram");
  });
});
