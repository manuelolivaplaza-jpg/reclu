import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
  canRefer,
  isValidReferralCode,
  normalizeReferralCode,
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

describe("isValidReferralCode / normalizeReferralCode", () => {
  it("acepta el formato de la 009: base 3-6 + guion + 4 hex", () => {
    expect(isValidReferralCode("manuel-ab12")).toBe(true);
    expect(isValidReferralCode("abc-1234")).toBe(true);
    expect(isValidReferralCode("abcdef-abcd")).toBe(true);
    expect(isValidReferralCode("a0b1-c0de")).toBe(true);
  });

  it("normaliza con trim + toLowerCase", () => {
    expect(normalizeReferralCode("  Manuel-AB12  ")).toBe("manuel-ab12");
    expect(normalizeReferralCode("ABC-1234")).toBe("abc-1234");
    expect(isValidReferralCode("Manuel-AB12")).toBe(true);
  });

  it("rechaza largos fuera de rango de la base", () => {
    expect(isValidReferralCode("ab-1234")).toBe(false); // 2
    expect(isValidReferralCode("abcdefg-1234")).toBe(false); // 7
  });

  it("rechaza sufijos que no son 4 hex", () => {
    expect(isValidReferralCode("manuel-abc")).toBe(false); // 3
    expect(isValidReferralCode("manuel-abcde")).toBe(false); // 5
    expect(isValidReferralCode("manuel-ghij")).toBe(false); // no hex
  });

  it("rechaza formatos sin guion o con caracteres extra", () => {
    expect(isValidReferralCode("ABC123")).toBe(false);
    expect(isValidReferralCode("ABC-123")).toBe(false);
    expect(isValidReferralCode("ABC_1234")).toBe(false);
    expect(isValidReferralCode("ABC 1234")).toBe(false);
    expect(isValidReferralCode("ABC-12 4")).toBe(false);
    expect(isValidReferralCode("")).toBe(false);
    expect(isValidReferralCode("   ")).toBe(false);
  });

  it("rechaza valores que no son string", () => {
    expect(isValidReferralCode(null)).toBe(false);
    expect(isValidReferralCode(undefined)).toBe(false);
    expect(isValidReferralCode(123456)).toBe(false);
    expect(isValidReferralCode({})).toBe(false);
    expect(normalizeReferralCode(null)).toBeNull();
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

  it("no duplica el esquema de la 009 (sin profiles.referral_code)", () => {
    expect(sql).not.toMatch(/add column if not exists referral_code/i);
    expect(sql).not.toMatch(/generate_referral_code/i);
    expect(sql).not.toMatch(/set_referral_code/i);
    expect(sql).not.toMatch(/create trigger/i);
    expect(sql).not.toMatch(/create table if not exists public\.referrals/i);
  });

  it("refuerza un invitado por fila con un bloque idempotente", () => {
    expect(sql).toMatch(/do \$\$/);
    expect(sql).toMatch(/to_regclass\('public\.referrals'\)/);
    expect(sql).toMatch(/add constraint referrals_referred_id_key unique \(referred_id\)/i);
  });

  it("no deja escribir referrals a anon/authenticated", () => {
    expect(sql).toMatch(/revoke insert, update, delete on table public\.referrals from authenticated;/i);
    expect(sql).toMatch(/revoke all on table public\.referrals from anon;/i);
    expect(sql).toMatch(/grant select on table public\.referrals to authenticated;/i);
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

  it("marca el premio aplicado y su ventana en referrals", () => {
    expect(sql).toMatch(/set reward_applied = 'free_month'/i);
    expect(sql).toMatch(/reward_period_end = v_period_end/i);
  });
});
