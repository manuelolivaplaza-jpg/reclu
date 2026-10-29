import { describe, it, expect } from "vitest";
import {
  rankAtLatestAsOf,
  trimHoldersForRole,
  type RankInput,
  type SymbolHolderRow,
} from "@/lib/ticker-queries";

function holder(over: Partial<SymbolHolderRow> = {}): SymbolHolderRow {
  return {
    portfolioId: "p1",
    slug: "p1",
    name: "Cartera",
    category: "political_us",
    premium: false,
    weight: 10,
    asOf: "2026-10-01",
    previousWeight: null,
    firstSeen: "2026-01-01",
    holdingName: "Nombre",
    priceCurrent: null,
    currency: "USD",
    returnPct: null,
    rankInPortfolio: 1,
    ...over,
  };
}

describe("trimHoldersForRole", () => {
  const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((rank) =>
    holder({
      portfolioId: `p${rank}`,
      slug: `p${rank}`,
      rankInPortfolio: rank,
      weight: 100 - rank,
    }),
  );

  // D55: anon y free no ven posiciones, salvo corredoras (broker_cl).
  it("anon no ve posiciones", () => {
    expect(trimHoldersForRole(rows, "anon")).toEqual([]);
  });

  it("free no ve posiciones", () => {
    expect(trimHoldersForRole(rows, "free")).toEqual([]);
  });

  it("corredoras (broker_cl) abiertas a anon y free", () => {
    const broker = rows.map((row) => ({ ...row, category: "broker_cl" }));
    expect(trimHoldersForRole(broker, "anon")).toHaveLength(rows.length);
    expect(trimHoldersForRole(broker, "free")).toHaveLength(rows.length);
  });

  it("pro (rol paid) ve todos los ranks", () => {
    expect(trimHoldersForRole(rows, "paid")).toHaveLength(rows.length);
  });

  it("oculta carteras premium a anon y free, y las muestra a pro", () => {
    const premium = holder({ premium: true, rankInPortfolio: 1, portfolioId: "prem" });
    expect(trimHoldersForRole([premium], "anon")).toEqual([]);
    expect(trimHoldersForRole([premium], "free")).toEqual([]);
    expect(trimHoldersForRole([premium], "paid")).toEqual([premium]);
  });

  it("rank null no recorta por tope y sí oculta premium a quien no paga", () => {
    const open = holder({ rankInPortfolio: null, premium: false });
    const hidden = holder({
      rankInPortfolio: null,
      premium: true,
      portfolioId: "prem",
    });
    expect(trimHoldersForRole([open, hidden], "anon")).toEqual([open]);
    expect(trimHoldersForRole([open, hidden], "free")).toEqual([open]);
    expect(trimHoldersForRole([open, hidden], "paid")).toEqual([open, hidden]);
  });
});

describe("rankAtLatestAsOf", () => {
  it("rankea el libro completo del as_of vigente, no solo el símbolo", () => {
    const rows: RankInput[] = [
      { id: "nvda", portfolioId: "p", asOf: "2026-10-01", weight: 2 },
      { id: "a", portfolioId: "p", asOf: "2026-10-01", weight: 20 },
      { id: "b", portfolioId: "p", asOf: "2026-10-01", weight: 15 },
      { id: "c", portfolioId: "p", asOf: "2026-10-01", weight: 11 },
      { id: "d", portfolioId: "p", asOf: "2026-10-01", weight: 8 },
      { id: "e", portfolioId: "p", asOf: "2026-10-01", weight: 4 },
    ];
    const ranks = rankAtLatestAsOf(rows);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("nvda")).toBe(6);
  });

  it("D55: anónimo no ve ningún puesto (antes top 5)", () => {
    const book: RankInput[] = [20, 15, 11, 8, 4, 2].map((weight, index) => ({
      id: `h${index}`,
      portfolioId: "p",
      asOf: "2026-10-01",
      weight,
    }));
    const ranks = rankAtLatestAsOf(book);
    const visible = trimHoldersForRole(
      book.map((row) =>
        holder({
          portfolioId: row.id,
          slug: row.id,
          weight: row.weight,
          rankInPortfolio: ranks.get(row.id) ?? null,
        }),
      ),
      "anon",
    );
    expect(visible.map((row) => row.weight)).toEqual([]);
  });

  it("ignora fechas anteriores al as_of vigente", () => {
    const ranks = rankAtLatestAsOf([
      { id: "old-heavy", portfolioId: "p", asOf: "2026-01-01", weight: 90 },
      { id: "nvda", portfolioId: "p", asOf: "2026-10-01", weight: 5 },
      { id: "aapl", portfolioId: "p", asOf: "2026-10-01", weight: 40 },
    ]);
    expect(ranks.has("old-heavy")).toBe(false);
    expect(ranks.get("aapl")).toBe(1);
    expect(ranks.get("nvda")).toBe(2);
  });

  it("desempata por id ascendente", () => {
    const ranks = rankAtLatestAsOf([
      { id: "b", portfolioId: "p", asOf: "2026-10-01", weight: 10 },
      { id: "a", portfolioId: "p", asOf: "2026-10-01", weight: 10 },
    ]);
    expect(ranks.get("a")).toBe(1);
    expect(ranks.get("b")).toBe(2);
  });

  it("rankea cada cartera por separado", () => {
    const ranks = rankAtLatestAsOf([
      { id: "p1-a", portfolioId: "p1", asOf: "2026-10-01", weight: 1 },
      { id: "p2-a", portfolioId: "p2", asOf: "2026-09-01", weight: 1 },
      { id: "p2-b", portfolioId: "p2", asOf: "2026-09-01", weight: 50 },
    ]);
    expect(ranks.get("p1-a")).toBe(1);
    expect(ranks.get("p2-b")).toBe(1);
    expect(ranks.get("p2-a")).toBe(2);
  });
});
