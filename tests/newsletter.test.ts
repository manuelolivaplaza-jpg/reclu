import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  composeWeekly,
  type WeeklyAlert,
} from "@/lib/publish/weekly";
import { PUBLISH_DISCLAIMER } from "@/lib/publish/compose";
import {
  NEWSLETTER_CONSENT_TEXT,
  newsletterSubscribeSchema,
} from "@/app/api/newsletter/subscribe/route";

const NOW = new Date("2026-10-20T15:00:00.000Z");

function alert(overrides: Partial<WeeklyAlert> = {}): WeeklyAlert {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    portfolio_id: "22222222-2222-4222-8222-222222222222",
    type: "weight_change",
    severity: "medium",
    title: "NVDA: +2,0pp (ahora 6,0%)",
    summary: "Cambio de peso en el portafolio.",
    payload: {
      symbol: "NVDA",
      name: "NVIDIA",
      weight: 6,
      previous_weight: 4,
      delta: 2,
      tx_date: "2026-10-10",
      disclosed: "2026-10-15",
      source_url: "https://disclosures-clerk.house.gov/nvda.pdf",
    },
    created_at: "2026-10-16T12:00:00.000Z",
    portfolio: {
      id: "22222222-2222-4222-8222-222222222222",
      slug: "pelosi-tracker",
      name: "Pelosi Tracker",
      source: "house_ptr",
    },
    ...overrides,
  };
}

function withDelta(delta: number, index: number, overrides: Partial<WeeklyAlert> = {}): WeeklyAlert {
  return alert({
    id: `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
    payload: {
      symbol: `SYM${index}`,
      weight: 10,
      previous_weight: 10 - delta,
      delta,
      tx_date: "2026-10-10",
      disclosed: "2026-10-15",
      source_url: `https://example.com/source-${index}`,
    },
    ...overrides,
  });
}

describe("composeWeekly", () => {
  it("elige el top 5 por variación absoluta y deja el resto fuera", () => {
    const alerts = [
      withDelta(0.6, 1),
      withDelta(-7.2, 2),
      withDelta(3.4, 3),
      withDelta(-0.8, 4),
      withDelta(5.1, 5),
      withDelta(1.2, 6),
      withDelta(-2.6, 7),
    ];

    const draft = composeWeekly(alerts, { now: NOW });

    expect(draft.payload.positions).toBe(5);
    expect(draft.payload.alert_ids).toHaveLength(5);
    expect(draft.payload.alert_ids[0]).toContain("00000002");
    expect(draft.payload.alert_ids[1]).toContain("00000005");
    expect(draft.payload.alert_ids[2]).toContain("00000003");
    expect(draft.payload.alert_ids[3]).toContain("00000007");
    expect(draft.payload.alert_ids[4]).toContain("00000006");
    expect(draft.body).not.toContain("SYM1");
    expect(draft.body).not.toContain("SYM4");
  });

  it("incluye la fuente de cada movimiento y el aviso de no asesoría", () => {
    const draft = composeWeekly([alert()], { now: NOW });

    expect(draft.body).toContain("https://disclosures-clerk.house.gov/nvda.pdf");
    expect(draft.body).toContain("house_ptr");
    expect(draft.body).toContain("Divulgado: 15-10-2026");
    expect(draft.body).toContain("5 días después de la operación");
    expect(draft.body).toContain(PUBLISH_DISCLAIMER);
    expect(draft.body).toContain("no constituye asesoría de inversión");
    expect(draft.channel).toBe("newsletter");
    expect(draft.status).toBe("draft");
  });

  it("usa el enlace público del portafolio si la alerta no trae source_url", () => {
    const base = alert();
    const draft = composeWeekly(
      [
        alert({
          payload: {
            ...base.payload,
            source_url: undefined,
          },
        }),
      ],
      { now: NOW },
    );

    expect(draft.body).toContain(
      "https://reclu.cl/portfolio/pelosi-tracker?utm_source=reclu&utm_medium=newsletter&utm_campaign=alertas",
    );
  });

  it("arma asunto y rango de la semana en el payload", () => {
    const draft = composeWeekly([alert()], { now: NOW });

    expect(draft.payload.subject).toContain("Los 1 movimientos de la semana");
    expect(draft.payload.subject).toContain("14 oct 2026");
    expect(draft.payload.subject).toContain("20 oct 2026");
    expect(draft.payload.week_start).toBe("14 oct 2026");
    expect(draft.payload.week_end).toBe("20 oct 2026");
    expect(draft.source_alert_id).toBe(alert().id);
  });

  it("no inventa movimientos cuando la semana viene vacía", () => {
    const draft = composeWeekly([], { now: NOW });

    expect(draft.payload.positions).toBe(0);
    expect(draft.payload.alert_ids).toEqual([]);
    expect(draft.source_alert_id).toBeNull();
    expect(draft.body).toContain("no hubo movimientos");
    expect(draft.body).toContain(PUBLISH_DISCLAIMER);
  });

  it("trata InfoProbidad como agregado y no copia títulos con nombres", () => {
    const draft = composeWeekly(
      [
        alert({
          title: "Juan Pérez declaró acciones de Enel",
          summary: "Juan Pérez aparece en la nómina de InfoProbidad.",
          portfolio: {
            id: "33333333-3333-4333-8333-333333333333",
            slug: "infoProbidad-cl",
            name: "InfoProbidad",
            source: "infoprobidad",
          },
          payload: {
            nombre: "Enel",
            autoridades: 3,
            delta: 4,
            weight: 4,
            previous_weight: 0,
          },
        }),
      ],
      { now: NOW },
    );

    expect(draft.body).toContain("Enel");
    expect(draft.body).toContain("3 autoridades declaran acciones");
    expect(draft.body).not.toContain("Juan Pérez");
  });

  it("respeta el máximo de movimientos pedido", () => {
    const alerts = [1, 2, 3, 4, 5, 6].map((index) => withDelta(index / 2, index));
    const draft = composeWeekly(alerts, { now: NOW, maxItems: 3 });

    expect(draft.payload.positions).toBe(3);
    expect(draft.payload.alert_ids).toHaveLength(3);
  });
});

describe("newsletterSubscribeSchema", () => {
  it("acepta correo y consentimiento explícito", () => {
    const parsed = newsletterSubscribeSchema.safeParse({
      email: "  Persona@Ejemplo.cl ",
      consent: true,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.source).toBe("footer");
      expect(parsed.data.email).toBe("Persona@Ejemplo.cl");
    }
  });

  it("rechaza la suscripción sin consentimiento", () => {
    const parsed = newsletterSubscribeSchema.safeParse({
      email: "persona@ejemplo.cl",
      consent: false,
    });

    expect(parsed.success).toBe(false);
  });

  it("rechaza correos inválidos y orígenes raros", () => {
    expect(
      newsletterSubscribeSchema.safeParse({ email: "no-es-correo", consent: true }).success,
    ).toBe(false);
    expect(
      newsletterSubscribeSchema.safeParse({
        email: "persona@ejemplo.cl",
        consent: true,
        source: "../../etc/passwd",
      }).success,
    ).toBe(false);
  });

  it("el consentimiento explica para qué se usa el correo", () => {
    expect(NEWSLETTER_CONSENT_TEXT).toContain("newsletter semanal");
    expect(NEWSLETTER_CONSENT_TEXT).toContain("darme de baja");
    expect(NEWSLETTER_CONSENT_TEXT.toLowerCase()).toContain("solo para");
  });
});

describe("migración 023_newsletter.sql", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "023_newsletter.sql"),
    "utf8",
  ).toLowerCase();

  it("es idempotente en tabla, índices y policies", () => {
    expect(sql).toContain("create table if not exists public.newsletter_subscribers");
    expect(sql).toContain("create index if not exists");
    expect(sql).toContain("create unique index if not exists");
    expect(sql).toContain("drop policy if exists");
    expect(sql).toContain("create or replace function");
    expect(sql).toContain("on conflict (email) do update");
    expect(sql).not.toMatch(/create table (?!if not exists)/);
  });

  it("no expone la tabla a anon y limita el alta", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.newsletter_subscribers from public, anon, authenticated");
    expect(sql).toContain("security definer");
    expect(sql).toContain("v_max_per_hour");
    expect(sql).toContain("rate limit");
  });
});
