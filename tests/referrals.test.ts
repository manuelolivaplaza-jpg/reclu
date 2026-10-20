import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
  canRefer,
  isValidReferralCode,
  referralsEnabled,
} from "@/lib/referrals";

const raiz = process.cwd();

function migracion(): string {
  return readFileSync(path.join(raiz, "supabase/migrations/039_referidos.sql"), "utf8");
}

describe("REFERRALS_ENABLED", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete process.env.REFERRALS_ENABLED;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.REFERRALS_ENABLED;
  });

  it("está apagado por defecto (sin variable)", () => {
    expect(referralsEnabled()).toBe(false);
  });

  it('sólo se enciende con el valor exacto "true"', () => {
    vi.stubEnv("REFERRALS_ENABLED", "true");
    expect(referralsEnabled()).toBe(true);

    for (const valor of ["TRUE", "True", "1", "yes", "on", " true", "true "]) {
      vi.stubEnv("REFERRALS_ENABLED", valor);
      expect(referralsEnabled()).toBe(false);
    }
  });
});

describe("isValidReferralCode", () => {
  it("acepta 6-16 caracteres alfanuméricos", () => {
    expect(isValidReferralCode("ABC123")).toBe(true);
    expect(isValidReferralCode("abcdef")).toBe(true);
    expect(isValidReferralCode("A1B2C3D4E5F6G7H8")).toBe(true);
    expect(isValidReferralCode("000000")).toBe(true);
  });

  it("rechaza largos fuera de rango", () => {
    expect(isValidReferralCode("A1B2C")).toBe(false); // 5
    expect(isValidReferralCode("A1B2C3D4E5F6G7H8I")).toBe(false); // 17
    expect(isValidReferralCode("")).toBe(false);
  });

  it("rechaza caracteres fuera de [A-Za-z0-9]", () => {
    expect(isValidReferralCode("ABC-123")).toBe(false);
    expect(isValidReferralCode("ABC_123")).toBe(false);
    expect(isValidReferralCode("ABC 123")).toBe(false);
    expect(isValidReferralCode(" ABC123")).toBe(false);
    expect(isValidReferralCode("ABC123 ")).toBe(false);
    expect(isValidReferralCode("ABCÑ12")).toBe(false);
  });

  it("rechaza valores que no son string", () => {
    expect(isValidReferralCode(null)).toBe(false);
    expect(isValidReferralCode(undefined)).toBe(false);
    expect(isValidReferralCode(123456)).toBe(false);
    expect(isValidReferralCode({})).toBe(false);
  });
});

describe("canRefer", () => {
  it("rechaza el autorreferido", () => {
    expect(canRefer("user-1", "user-1")).toBe(false);
  });

  it("permite referir a otro usuario", () => {
    expect(canRefer("user-1", "user-2")).toBe(true);
  });

  it("exige ambos ids", () => {
    expect(canRefer(null, "user-2")).toBe(false);
    expect(canRefer("user-1", null)).toBe(false);
    expect(canRefer("", "")).toBe(false);
    expect(canRefer(undefined, undefined)).toBe(false);
  });
});

describe("cookie de referido", () => {
  it("vive 30 días", () => {
    expect(REFERRAL_COOKIE).toBe("reclu_ref");
    expect(REFERRAL_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 30);
  });
});

describe("migración 039_referidos.sql", () => {
  const sql = migracion();

  it("crea la columna y la tabla de forma idempotente", () => {
    expect(sql).toContain("add column if not exists referral_code text");
    expect(sql).toContain("create table if not exists public.referrals");
    expect(sql).toContain("referred_id uuid not null unique");
    expect(sql).toContain("check (status in ('pending', 'rewarded'))");
  });

  it("protege la tabla con RLS: el usuario sólo ve sus referidos", () => {
    expect(sql).toMatch(/alter table public\.referrals enable row level security;/i);
    expect(sql).toMatch(/create policy referrals_select_own[\s\S]*for select[\s\S]*to authenticated/i);
    expect(sql).toMatch(/using \(referrer_id = \(select auth\.uid\(\)\)\)/i);
  });

  it("no deja escribir referrals a anon/authenticated", () => {
    expect(sql).toMatch(/revoke insert, update, delete on table public\.referrals from authenticated;/i);
    expect(sql).toMatch(/revoke all on table public\.referrals from anon;/i);
  });

  it("reward_referral es security definer con search_path vacío", () => {
    expect(sql).toMatch(/create or replace function public\.reward_referral\(p_referred uuid\)/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = ''/i);
  });

  it("reward_referral sólo lo puede ejecutar service_role", () => {
    expect(sql).toMatch(
      /revoke execute on function public\.reward_referral\(uuid\) from public, anon, authenticated;/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.reward_referral\(uuid\) to service_role;/i,
    );
  });

  it("premia una sola vez y no permite autorreferidos", () => {
    expect(sql).toMatch(/and status = 'pending'/i);
    expect(sql).toMatch(/and referrer_id <> referred_id/i);
    expect(sql).toMatch(/set status = 'rewarded'/i);
    expect(sql).toMatch(/interval '1 month'/i);
    expect(sql).toMatch(/perform set_config\('reclu\.trusted', 'on', true\);/i);
  });

  it("genera referral_code para perfiles nuevos y rellena los viejos", () => {
    expect(sql).toMatch(/create or replace function public\.generate_referral_code\(\)/i);
    expect(sql).toMatch(/create trigger z_set_referral_code/i);
    expect(sql).toMatch(/where referral_code is null/i);
  });
});
