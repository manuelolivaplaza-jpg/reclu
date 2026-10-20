import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPublishRecords, publishDraft, recentPublishRecords } from "@/lib/publish";
import { canSendLive, isChannelEnabled, publishMode } from "@/lib/publish/flags";
import type { Channel, Draft, DraftStatus, Publisher } from "@/lib/publish/types";

const ENV_KEYS = [
  "PUBLISH_MODE",
  "PUBLISH_X_ENABLED",
  "PUBLISH_TELEGRAM_ENABLED",
  "PUBLISH_NEWSLETTER_ENABLED",
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

const NOT_APPROVED = ["draft", "rejected", "sent", "failed"] as const satisfies readonly DraftStatus[];

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  clearPublishRecords();
});

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "draft-1",
    channel: "x",
    body: "Cambio público en una cartera seguida.",
    payload: {},
    source_alert_id: null,
    status: "approved",
    preview_url: null,
    created_at: "2026-10-19T00:00:00.000Z",
    approved_by: null,
    approved_at: null,
    sent_at: null,
    external_id: null,
    error: null,
    ...overrides,
  };
}

function fakePublisher(channel: Channel) {
  const validate = vi.fn();
  const send = vi.fn(async () => ({ externalId: "ext-1" }));
  const publisher: Publisher = { channel, validate, send };
  return { publisher, validate, send };
}

function clearPublishEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("flags de publicación", () => {
  it("mantiene los canales apagados por defecto", () => {
    clearPublishEnv();
    expect(isChannelEnabled("x")).toBe(false);
    expect(isChannelEnabled("telegram")).toBe(false);
    expect(isChannelEnabled("newsletter")).toBe(false);
    expect(publishMode()).toBe("preview");
  });

  it("no activa el canal con TRUE ni con 1", () => {
    clearPublishEnv();
    process.env.PUBLISH_X_ENABLED = "TRUE";
    process.env.PUBLISH_TELEGRAM_ENABLED = "1";
    process.env.PUBLISH_NEWSLETTER_ENABLED = "True";
    expect(isChannelEnabled("x")).toBe(false);
    expect(isChannelEnabled("telegram")).toBe(false);
    expect(isChannelEnabled("newsletter")).toBe(false);

    process.env.PUBLISH_X_ENABLED = "true";
    expect(isChannelEnabled("x")).toBe(true);
    expect(isChannelEnabled("telegram")).toBe(false);
    expect(isChannelEnabled("newsletter")).toBe(false);
  });

  it("solo acepta draft o live como modo; el resto es preview", () => {
    clearPublishEnv();
    expect(publishMode()).toBe("preview");
    process.env.PUBLISH_MODE = "LIVE";
    expect(publishMode()).toBe("preview");
    process.env.PUBLISH_MODE = "draft";
    expect(publishMode()).toBe("draft");
    process.env.PUBLISH_MODE = "live";
    expect(publishMode()).toBe("live");
  });

  const CHANNEL_ENV = {
    x: "PUBLISH_X_ENABLED",
    telegram: "PUBLISH_TELEGRAM_ENABLED",
    newsletter: "PUBLISH_NEWSLETTER_ENABLED",
  } as const satisfies Record<Channel, string>;

  it.each(Object.keys(CHANNEL_ENV) as Channel[])(
    "el canal %s queda apagado si la env no es exactamente true",
    (channel) => {
      const key = CHANNEL_ENV[channel];
      const noVerdaderos = [undefined, "", " ", "true ", " true", "TRUE", "True", "1", "yes", "on", "false"];

      for (const value of noVerdaderos) {
        clearPublishEnv();
        if (value !== undefined) process.env[key] = value;
        expect(isChannelEnabled(channel)).toBe(false);
        process.env.PUBLISH_MODE = "live";
        expect(canSendLive(channel, "approved")).toBe(false);
      }

      clearPublishEnv();
      process.env[key] = "true";
      expect(isChannelEnabled(channel)).toBe(true);
      process.env.PUBLISH_MODE = "live";
      expect(canSendLive(channel, "approved")).toBe(true);
    },
  );
});

describe("publishDraft", () => {
  it("en preview nunca llama a send", async () => {
    clearPublishEnv();
    process.env.PUBLISH_X_ENABLED = "true";
    for (const mode of [undefined, "preview", "PREVIEW", ""] as const) {
      if (mode === undefined) delete process.env.PUBLISH_MODE;
      else process.env.PUBLISH_MODE = mode;
      const { publisher, send, validate } = fakePublisher("x");
      const result = await publishDraft(draft({ channel: "x", status: "approved" }), [publisher]);
      expect(send).not.toHaveBeenCalled();
      expect(validate).not.toHaveBeenCalled();
      expect(result).toEqual({ skipped: true, reason: "Modo preview: no se envía." });
    }
  });

  it("no envía si el canal está apagado, aunque el modo sea live", async () => {
    clearPublishEnv();
    process.env.PUBLISH_MODE = "live";
    for (const value of [undefined, "", "TRUE", "1", "yes", "false"] as const) {
      if (value === undefined) delete process.env.PUBLISH_X_ENABLED;
      else process.env.PUBLISH_X_ENABLED = value;
      const { publisher, send } = fakePublisher("x");
      const result = await publishDraft(draft({ channel: "x", status: "approved" }), [publisher]);
      expect(send).not.toHaveBeenCalled();
      expect(result).toEqual({ skipped: true, reason: "El canal está apagado." });
    }
  });

  it.each(NOT_APPROVED)("no envía un borrador en estado %s", async (status) => {
    clearPublishEnv();
    process.env.PUBLISH_MODE = "live";
    process.env.PUBLISH_X_ENABLED = "true";
    const { publisher, send, validate } = fakePublisher("x");
    const result = await publishDraft(draft({ channel: "x", status }), [publisher]);
    expect(send).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
    expect(result).toEqual({
      skipped: false,
      rejected: true,
      reason: "El borrador no está aprobado.",
    });
  });

  it("el modo draft no llama a send", async () => {
    clearPublishEnv();
    process.env.PUBLISH_MODE = "draft";
    process.env.PUBLISH_TELEGRAM_ENABLED = "true";
    const { publisher, send } = fakePublisher("telegram");
    const result = await publishDraft(
      draft({ channel: "telegram", status: "approved" }),
      [publisher],
    );
    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: true, reason: "Modo draft: no se publica en vivo." });
  });

  it("live con el flag exactamente true envía el borrador aprobado", async () => {
    clearPublishEnv();
    process.env.PUBLISH_MODE = "live";
    process.env.PUBLISH_NEWSLETTER_ENABLED = "true";
    const { publisher, send, validate } = fakePublisher("newsletter");
    const result = await publishDraft(
      draft({
        channel: "newsletter",
        status: "approved",
        body: "Resumen semanal informativo.",
      }),
      [publisher],
    );
    expect(validate).toHaveBeenCalledWith("Resumen semanal informativo.");
    expect(send).toHaveBeenCalledOnce();
    expect(result).toEqual({ skipped: false, externalId: "ext-1" });
    expect(recentPublishRecords().map((entry) => entry.result)).toEqual([
      { skipped: false, externalId: "ext-1" },
    ]);
  });

  it("registra un envío omitido y no toca otro canal", async () => {
    clearPublishEnv();
    process.env.PUBLISH_MODE = "live";
    process.env.PUBLISH_X_ENABLED = "true";
    const other = fakePublisher("telegram");
    const result = await publishDraft(draft({ channel: "x", status: "approved" }), [
      other.publisher,
    ]);
    expect(other.send).not.toHaveBeenCalled();
    expect(result).toEqual({
      skipped: false,
      error: "No hay un publicador para este canal.",
    });
    expect(recentPublishRecords()).toHaveLength(1);
  });

  it("no llama a send si validate rechaza el cuerpo", async () => {
    clearPublishEnv();
    process.env.PUBLISH_MODE = "live";
    process.env.PUBLISH_X_ENABLED = "true";
    const { publisher, send, validate } = fakePublisher("x");
    validate.mockImplementation(() => {
      throw new Error("El texto está vacío.");
    });
    const result = await publishDraft(draft({ body: "" }), [publisher]);
    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: false, error: "El texto está vacío." });
  });
});
