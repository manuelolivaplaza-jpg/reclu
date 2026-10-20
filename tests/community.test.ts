import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ADVICE_PHRASES,
  COMMUNITY_FLAG,
  CREATOR_ALIAS_PATTERN,
  containsAdviceImperative,
  creatorAliasSchema,
  creatorBioSchema,
  creatorPortfolioSchema,
  creatorProfileSchema,
  communityEnabled,
  normalizeAdviceText,
} from "@/lib/community";

const raiz = process.cwd();

function fuente(rutaRelativa: string): string {
  return readFileSync(path.join(raiz, rutaRelativa), "utf8");
}

const sql = fuente("supabase/migrations/038_comunidad.sql");

afterEach(() => {
  delete process.env[COMMUNITY_FLAG];
});

describe("communityEnabled (F49-A): apagado por defecto", () => {
  it("sin la variable devuelve false", () => {
    delete process.env[COMMUNITY_FLAG];
    expect(communityEnabled()).toBe(false);
  });

  it("solo el literal 'true' la enciende", () => {
    for (const valor of ["1", "TRUE", "True", "yes", "on", " true", ""]) {
      process.env[COMMUNITY_FLAG] = valor;
      expect(communityEnabled()).toBe(false);
    }
    process.env[COMMUNITY_FLAG] = "true";
    expect(communityEnabled()).toBe(true);
  });
});

describe("containsAdviceImperative: lenguaje de asesoría", () => {
  it("detecta las frases imperativas prohibidas", () => {
    const casos = [
      "Compra ya estas acciones",
      "COMPREN AHORA mientras está barato",
      "Vendan todo antes del cierre",
      "Te recomiendo comprar Apple",
      "Les recomiendo vender el fondo",
      "Es momento de comprar, sin dudarlo",
      "Hay que vender antes de que caiga",
      "No compres si no entiendes el riesgo",
      "Compra, ¡ya!",
      "vende-ahora",
    ];
    for (const caso of casos) {
      expect(containsAdviceImperative(caso), caso).toBe(true);
    }
  });

  it("ignora tildes y mayúsculas al comparar", () => {
    expect(containsAdviceImperative("CÓMPREN YA")).toBe(true);
    expect(containsAdviceImperative("cómprén ahora")).toBe(true);
    expect(normalizeAdviceText("  Véndé   AHORA ")).toBe("vende ahora");
  });

  it("permite textos neutros e informativos", () => {
    const neutros = [
      "La cartera mantiene un 12% en bancos chilenos.",
      "Analizamos el movimiento del fondo durante el trimestre.",
      "Este contenido es informativo y no constituye asesoría financiera.",
      "Los titulares de la empresa comprenden tres divisiones.",
      "El precio de compra y el de venta se muestran como referencia.",
      "La posición en Apple bajó de 8% a 6% este mes.",
      "",
    ];
    for (const texto of neutros) {
      expect(containsAdviceImperative(texto), texto).toBe(false);
    }
  });

  it("respeta límites de palabra (no marca 'comprenden')", () => {
    expect(containsAdviceImperative("ellos comprenden el riesgo")).toBe(false);
    expect(containsAdviceImperative("compren el riesgo")).toBe(true);
    expect(ADVICE_PHRASES).toContain("compra ya");
  });
});

describe("esquemas Zod de comunidad", () => {
  it("acepta alias válidos y rechaza inválidos", () => {
    for (const alias of ["abc", "manu-01", "fondo_alpha", "a1b"]) {
      expect(creatorAliasSchema.safeParse(alias).success, alias).toBe(true);
    }
    for (const alias of [
      "AB",
      "Mayusculas",
      "con espacio",
      "-empieza-guion",
      "a",
      "x".repeat(31),
      "ñandu",
    ]) {
      expect(creatorAliasSchema.safeParse(alias).success, alias).toBe(false);
    }
    expect(creatorAliasSchema.parse("  manu-01  ")).toBe("manu-01");
    expect(CREATOR_ALIAS_PATTERN.test("manu-01")).toBe(true);
  });

  it("limita el largo de la bio", () => {
    expect(creatorBioSchema.safeParse("x".repeat(600)).success).toBe(true);
    expect(creatorBioSchema.safeParse("x".repeat(601)).success).toBe(false);
  });

  it("el perfil exige declaración explícita de no asesoría como booleano", () => {
    const ok = creatorProfileSchema.parse({
      alias: "manu-01",
      bio: "Carteras de ejemplo.",
      declara_no_asesoria: true,
    });
    expect(ok.declara_no_asesoria).toBe(true);
    expect(ok.conflicto_interes).toBe("");

    const porDefecto = creatorProfileSchema.parse({ alias: "manu-01" });
    expect(porDefecto.declara_no_asesoria).toBe(false);

    expect(
      creatorProfileSchema.safeParse({
        alias: "manu-01",
        declara_no_asesoria: "si",
      }).success,
    ).toBe(false);
  });

  it("valida el portafolio y sus holdings", () => {
    const ok = creatorPortfolioSchema.parse({
      titulo: "Cartera defensiva",
      descripcion: "Solo información pública.",
      holdings: [
        { symbol: "AAPL", weight: 12.5 },
        { symbol: "BCH", name: "Banco de Chile", weight: 8 },
      ],
    });
    expect(ok.holdings).toHaveLength(2);
    expect(ok.descripcion).toContain("información");

    expect(
      creatorPortfolioSchema.safeParse({
        titulo: "ab",
        holdings: [{ symbol: "AAPL", weight: 10 }],
      }).success,
    ).toBe(false);

    expect(
      creatorPortfolioSchema.safeParse({ titulo: "Cartera", holdings: [] })
        .success,
    ).toBe(false);

    expect(
      creatorPortfolioSchema.safeParse({
        titulo: "Cartera",
        holdings: [{ symbol: "AAPL", weight: 120 }],
      }).success,
    ).toBe(false);

    expect(
      creatorPortfolioSchema.safeParse({
        titulo: "Cartera",
        holdings: Array.from({ length: 101 }, () => ({
          symbol: "AAPL",
          weight: 1,
        })),
      }).success,
    ).toBe(false);
  });
});

describe("migración 038_comunidad.sql", () => {
  it("crea ambas tablas de forma idempotente", () => {
    expect(sql).toContain(
      "create table if not exists public.creator_profiles",
    );
    expect(sql).toContain(
      "create table if not exists public.creator_portfolios",
    );
    expect(sql).toContain(
      "create index if not exists idx_creator_portfolios_creator",
    );
    expect(sql).toMatch(/user_id uuid not null unique references auth\.users/);
    expect(sql).toMatch(/alias text not null unique/);
  });

  it("valida alias con regex y estados permitidos", () => {
    expect(sql).toContain("^[a-z0-9][a-z0-9_-]{2,29}$");
    expect(sql).toContain("estado in ('pending', 'approved', 'rejected')");
    expect(sql).toContain("estado text not null default 'pending'");
    expect(sql).toContain("verificado boolean not null default false");
    expect(sql).toContain(
      "declara_no_asesoria boolean not null default false",
    );
  });

  it("activa RLS y solo publica lo aprobado y verificado", () => {
    expect(sql).toContain(
      "alter table public.creator_profiles enable row level security;",
    );
    expect(sql).toContain(
      "alter table public.creator_portfolios enable row level security;",
    );
    expect(sql).toMatch(
      /create policy "creator_portfolios public read approved"[\s\S]*?using \(estado = 'approved'\);/,
    );
    expect(sql).toMatch(
      /create policy "creator_profiles public read approved"[\s\S]*?verificado = true[\s\S]*?creator_has_approved\(id\)/,
    );
  });

  it("el dueño solo ve/crea/edita lo suyo y nada en pending", () => {
    expect(sql).toContain("auth.uid() = user_id");
    expect(sql).toContain("creator_id = public.current_creator_id()");
    expect(sql).toMatch(
      /creator_portfolios owner update"[\s\S]*?and estado = 'pending'/,
    );
    expect(sql).toContain("to authenticated");
  });

  it("protege estado/verificado/moderación con trigger trusted", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("current_setting('reclu.trusted', true) = 'on'");
    expect(sql).toContain("new.verificado := old.verificado;");
    expect(sql).toContain("new.estado := old.estado;");
    expect(sql).toContain("new.moderated_at := old.moderated_at;");
    expect(sql).toContain("new.moderated_by := old.moderated_by;");
    expect(sql).toContain("new.estado := 'pending';");
    expect(sql).toContain(
      "revoke execute on function public.protect_creator_portfolio_columns() from public, anon, authenticated;",
    );
  });

  it("es reejecutable: no deja políticas ni triggers duplicados", () => {
    const drops = [...sql.matchAll(/drop policy if exists/g)].length;
    const creates = [...sql.matchAll(/create policy/g)].length;
    expect(drops).toBe(creates);
    expect(sql).toContain(
      "drop trigger if exists protect_creator_portfolio_columns on public.creator_portfolios;",
    );
  });
});
