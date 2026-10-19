import { afterEach, describe, expect, it, vi } from "vitest";
import {
  escapeTelegramHtml,
  telegramChannelPublisher,
} from "@/lib/publish/telegram-channel";
import {
  escapeNewsletterHtml,
  newsletterPublisher,
  renderNewsletterHtml,
  type NewsletterRecipient,
  type ResendClient,
  type ResendEmailMessage,
} from "@/lib/publish/newsletter";
import type { Draft } from "@/lib/publish/types";

const ENV_KEYS = [
  "PUBLISH_MODE",
  "PUBLISH_TELEGRAM_ENABLED",
  "PUBLISH_NEWSLETTER_ENABLED",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHANNEL_ID",
  "NEWSLETTER_FROM",
  "EMAIL_FROM",
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "draft-1",
    channel: "telegram",
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

function telegramFetch(messageId = 42) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(JSON.stringify({ ok: true, result: { message_id: messageId } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function resendDouble() {
  let calls = 0;
  const send = vi.fn(async (_message: ResendEmailMessage) => {
    calls += 1;
    return { data: { id: `mail-${calls}` }, error: null };
  });
  return { client: { emails: { send } } as ResendClient, send };
}

function listOf(recipients: readonly NewsletterRecipient[]) {
  return { recipients: async () => recipients };
}

describe("Telegram: escape HTML", () => {
  it("escapa &, <, > y comillas antes de usar parse_mode HTML", () => {
    expect(escapeTelegramHtml('A & B <b>"C"</b>')).toBe(
      "A &amp; B &lt;b&gt;&quot;C&quot;&lt;/b&gt;",
    );
  });
});

describe("Telegram: publicador del canal", () => {
  it("sin TELEGRAM_BOT_TOKEN no llama a la API", async () => {
    clearEnv();
    process.env.PUBLISH_TELEGRAM_ENABLED = "true";
    process.env.TELEGRAM_CHANNEL_ID = "@reclu";
    const fetchImpl = telegramFetch();
    const publisher = telegramChannelPublisher(fetchImpl);

    await expect(publisher.send(draft())).rejects.toThrow(/TELEGRAM_BOT_TOKEN/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sin TELEGRAM_CHANNEL_ID no llama a la API", async () => {
    clearEnv();
    process.env.PUBLISH_TELEGRAM_ENABLED = "true";
    process.env.TELEGRAM_BOT_TOKEN = "token";
    const fetchImpl = telegramFetch();

    await expect(telegramChannelPublisher(fetchImpl).send(draft())).rejects.toThrow(
      /TELEGRAM_CHANNEL_ID/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("con el flag apagado no llama a la API aunque esté configurado", async () => {
    clearEnv();
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_CHANNEL_ID = "@reclu";
    const fetchImpl = telegramFetch();

    await expect(telegramChannelPublisher(fetchImpl).send(draft())).rejects.toThrow(
      /apagado/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("envía texto escapado con HTML y sin vista previa de enlaces", async () => {
    clearEnv();
    process.env.PUBLISH_TELEGRAM_ENABLED = "true";
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_CHANNEL_ID = "@reclu";
    const fetchImpl = telegramFetch(77);
    const publisher = telegramChannelPublisher(fetchImpl);

    const result = await publisher.send(draft({ body: "<b>Hola</b> & adiós" }));

    expect(result).toEqual({ externalId: "77" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.telegram.org/bottoken/sendMessage");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: "@reclu",
      text: "&lt;b&gt;Hola&lt;/b&gt; &amp; adiós",
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  });

  it("validate rechaza un cuerpo vacío o mayor a 4096 caracteres", () => {
    const publisher = telegramChannelPublisher(telegramFetch());
    expect(() => publisher.validate("   ")).toThrow(/vacío/);
    expect(() => publisher.validate("a".repeat(4097))).toThrow(/4096/);
    expect(() => publisher.validate("a".repeat(4096))).not.toThrow();
  });
});

describe("Newsletter: escape y render", () => {
  it("escapa el cuerpo y el enlace de baja", () => {
    expect(escapeNewsletterHtml('A & <B> "C"')).toBe(
      "A &amp; &lt;B&gt; &quot;C&quot;",
    );
    const html = renderNewsletterHtml(
      "Línea <script>alert(1)</script>\n\nSegundo párrafo",
      "https://reclu.cl/baja?token=a&b=1",
    );
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Segundo párrafo");
    expect(html).toContain("https://reclu.cl/baja?token=a&amp;b=1");
  });
});

describe("Newsletter: publicador", () => {
  it("sin remitente configurado no envía", async () => {
    clearEnv();
    process.env.PUBLISH_NEWSLETTER_ENABLED = "true";
    const { client, send } = resendDouble();
    const publisher = newsletterPublisher(
      client,
      listOf([{ email: "a@example.com", unsubscribeUrl: "https://reclu.cl/baja" }]),
    );

    await expect(publisher.send(draft({ channel: "newsletter" }))).rejects.toThrow(
      /NEWSLETTER_FROM/,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("con el flag apagado no envía aunque haya remitente", async () => {
    clearEnv();
    process.env.EMAIL_FROM = "reclu.cl <hola@reclu.cl>";
    const { client, send } = resendDouble();
    const publisher = newsletterPublisher(
      client,
      listOf([{ email: "a@example.com", unsubscribeUrl: "https://reclu.cl/baja" }]),
    );

    await expect(publisher.send(draft({ channel: "newsletter" }))).rejects.toThrow(
      /apagado/,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("envía por lotes con List-Unsubscribe y enlace de baja en cada correo", async () => {
    clearEnv();
    process.env.PUBLISH_NEWSLETTER_ENABLED = "true";
    process.env.NEWSLETTER_FROM = "reclu.cl <newsletter@reclu.cl>";
    process.env.EMAIL_FROM = "alertas@reclu.cl";
    const { client, send } = resendDouble();
    const recipients = [
      { email: "a@example.com", unsubscribeUrl: "https://reclu.cl/baja?token=a" },
      { email: "b@example.com", unsubscribeUrl: "https://reclu.cl/baja?token=b" },
    ];
    const publisher = newsletterPublisher(client, listOf(recipients), { batchSize: 1 });

    const result = await publisher.send(
      draft({
        channel: "newsletter",
        body: "Resumen semanal.\n\nSegundo bloque.",
        payload: { subject: "Lo que movieron los grandes" },
      }),
    );

    expect(result).toEqual({ externalId: "batch:2:mail-1" });
    expect(send).toHaveBeenCalledTimes(2);

    for (const [index, call] of send.mock.calls.entries()) {
      const message = call[0];
      expect(message.from).toBe("reclu.cl <newsletter@reclu.cl>");
      expect(message.to).toBe(recipients[index].email);
      expect(message.subject).toBe("Lo que movieron los grandes");
      expect(message.headers).toEqual({
        "List-Unsubscribe": `<${recipients[index].unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      });
      expect(message.html).toContain(recipients[index].unsubscribeUrl);
      expect(message.html).toContain("Segundo bloque.");
    }
  });

  it("usa EMAIL_FROM si falta NEWSLETTER_FROM", async () => {
    clearEnv();
    process.env.PUBLISH_NEWSLETTER_ENABLED = "true";
    process.env.EMAIL_FROM = "alertas@reclu.cl";
    const { client, send } = resendDouble();
    const publisher = newsletterPublisher(
      client,
      listOf([{ email: "a@example.com", unsubscribeUrl: "https://reclu.cl/baja" }]),
    );

    const result = await publisher.send(draft({ channel: "newsletter" }));
    expect(result).toEqual({ externalId: "mail-1" });
    expect(send.mock.calls[0][0].from).toBe("alertas@reclu.cl");
  });

  it("no envía si un destinatario no trae enlace de baja", async () => {
    clearEnv();
    process.env.PUBLISH_NEWSLETTER_ENABLED = "true";
    process.env.NEWSLETTER_FROM = "newsletter@reclu.cl";
    const { client, send } = resendDouble();
    const publisher = newsletterPublisher(
      client,
      listOf([
        { email: "a@example.com", unsubscribeUrl: "https://reclu.cl/baja" },
        { email: "b@example.com", unsubscribeUrl: "" },
      ]),
    );

    await expect(publisher.send(draft({ channel: "newsletter" }))).rejects.toThrow(
      /enlace de baja/,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("no envía a una lista vacía", async () => {
    clearEnv();
    process.env.PUBLISH_NEWSLETTER_ENABLED = "true";
    process.env.NEWSLETTER_FROM = "newsletter@reclu.cl";
    const { client, send } = resendDouble();

    await expect(
      newsletterPublisher(client, listOf([])).send(draft({ channel: "newsletter" })),
    ).rejects.toThrow(/vacía/);
    expect(send).not.toHaveBeenCalled();
  });
});
