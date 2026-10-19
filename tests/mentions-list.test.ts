import { describe, expect, it } from "vitest";
import {
  demoCramerMentions,
  demoMuskMentions,
  demoTrumpMentions,
  formatMentionDate,
  mentionKindLabel,
  MUSK_INSIDER_NOTICE,
  primarySourceUrl,
  recluActionLabel,
  selectVerifiedMentions,
  shortQuote,
  type MentionRow,
} from "@/lib/mentions-queries";

function row(over: Partial<MentionRow>): MentionRow {
  return {
    id: "m",
    saidAt: "2026-01-01T16:00+00:00",
    entryDate: "2026-01-01",
    symbol: "DELL",
    company: "Dell",
    kind: "compra_directa",
    quote: "Go out and buy a Dell.",
    sourceUrls: ["https://example.com/fuente"],
    status: "verificada",
    externalId: "MX",
    ...over,
  };
}

describe("shortQuote", () => {
  it("deja intacta una frase que cabe", () => {
    expect(shortQuote("Go out and buy a Dell.")).toBe("Go out and buy a Dell.");
  });

  it("colapsa espacios y corta en una palabra, con elipsis, dentro de 80", () => {
    const quote =
      "It is my Great Honor to report that the United States of America now fully owns and controls 10% of INTEL.";
    const short = shortQuote(quote);
    expect(short.endsWith("…")).toBe(true);
    expect(short.length).toBeLessThanOrEqual(80);
    expect(short.length).toBeGreaterThan(40);
    expect(short.includes("  ")).toBe(false);
  });

  it("respeta un máximo chico", () => {
    expect(shortQuote("Palantir Technologies", 10).length).toBeLessThanOrEqual(10);
  });
});

describe("mentionKindLabel", () => {
  it("traduce los tipos de la migración 014", () => {
    expect(mentionKindLabel("compra_directa")).toBe("Compra directa");
    expect(mentionKindLabel("compra_directa_mercado")).toBe("Compra del mercado");
    expect(mentionKindLabel("elogio_con_ticker")).toBe("Elogio con ticker");
    expect(mentionKindLabel("elogio_acuerdo")).toBe("Elogio al acuerdo");
  });

  it("un tipo desconocido o vacío queda como Mención", () => {
    expect(mentionKindLabel(null)).toBe("Mención");
    expect(mentionKindLabel("rumor")).toBe("Mención");
  });

  it("traduce los tipos de Inverse Cramer", () => {
    expect(mentionKindLabel("recomienda_compra")).toBe("Recomienda compra");
    expect(mentionKindLabel("recomienda_venta")).toBe("Recomienda venta");
  });

  it("traduce los tipos de Musk (017)", () => {
    expect(mentionKindLabel("empresa_propia")).toBe("Empresa propia");
    expect(mentionKindLabel("critica")).toBe("Crítica");
    expect(mentionKindLabel("elogio")).toBe("Elogio");
  });
});

describe("recluActionLabel", () => {
  it("invierte el lado de Cramer y no inventa un lado para Trump", () => {
    expect(recluActionLabel("recomienda_compra", "hwm")).toBe("Corto HWM");
    expect(recluActionLabel("recomienda_venta", "RKLB")).toBe("Compra RKLB");
    expect(recluActionLabel("compra_directa", "DELL")).toBeNull();
    expect(recluActionLabel("recomienda_compra", "  ")).toBeNull();
    expect(recluActionLabel(null, "MTZ")).toBeNull();
  });
});

describe("menciones de Musk", () => {
  it("lista las cuatro, con URL de X, y no esconde la empresa propia", () => {
    const rows = demoMuskMentions();
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.sourceUrls[0]?.startsWith("https://x.com/elonmusk/status/"))).toBe(
      true,
    );
    const visible = selectVerifiedMentions(rows);
    expect(visible.map((row) => row.symbol)).toEqual(["CDR", "GME", "ETSY", "TSLA"]);
    const tesla = visible.find((row) => row.symbol === "TSLA");
    expect(tesla?.kind).toBe("empresa_propia");
    expect(tesla?.sourceUrl).toBe("https://x.com/elonmusk/status/1256239815256797184");
    expect(MUSK_INSIDER_NOTICE).toBe(
      "Musk es insider de Tesla/SpaceX/xAI; esas menciones no son señal.",
    );
  });
});

describe("formatMentionDate", () => {
  it("usa el día del texto ISO, no la zona del servidor", () => {
    expect(formatMentionDate("2025-03-10T21:00+00:00")).toBe("10 mar 2025");
    expect(formatMentionDate("2026-01-08T22:00+00:00")).toBe("8 ene 2026");
    expect(formatMentionDate("2026-09-06")).toBe("6 sep 2026");
  });

  it("devuelve el texto si no hay fecha", () => {
    expect(formatMentionDate("sin fecha")).toBe("sin fecha");
  });
});

describe("primarySourceUrl", () => {
  it("toma la primera URL http(s) y descarta el resto de esquemas", () => {
    expect(primarySourceUrl(["  javascript:alert(1)", "https://example.com/a"])).toBe(
      "https://example.com/a",
    );
    expect(primarySourceUrl(["nota sin url"])).toBeNull();
    expect(primarySourceUrl([])).toBeNull();
  });
});

describe("selectVerifiedMentions", () => {
  it("deja fuera pendiente, descartada y filas sin fuente http(s)", () => {
    const kept = selectVerifiedMentions([
      row({ id: "ok", externalId: "OK" }),
      row({ id: "pend", status: "pendiente", externalId: "P" }),
      row({ id: "drop", status: "descartada", externalId: "D" }),
      row({ id: "nofuente", sourceUrls: [], externalId: "N" }),
      row({ id: "js", sourceUrls: ["javascript:alert(1)"], externalId: "J" }),
      row({ id: "vacia", quote: "   ", externalId: "V" }),
    ]);
    expect(kept.map((mention) => mention.id)).toEqual(["ok"]);
  });

  it("ordena de más reciente a más antigua y no muta la entrada", () => {
    const input = [
      row({ id: "old", saidAt: "2025-03-10T21:00+00:00", symbol: "tsla" }),
      row({ id: "new", saidAt: "2026-09-06T16:00+00:00", symbol: "intc" }),
    ];
    const copy = input.map((item) => item.saidAt);
    const kept = selectVerifiedMentions(input);
    expect(kept.map((mention) => mention.id)).toEqual(["new", "old"]);
    expect(kept[1]?.symbol).toBe("TSLA");
    expect(input.map((item) => item.saidAt)).toEqual(copy);
  });

  it("el respaldo demo son las 15 verificadas, cada una con fuente", () => {
    const demo = demoTrumpMentions();
    expect(demo).toHaveLength(15);
    expect(new Set(demo.map((mention) => mention.externalId)).size).toBe(15);
    const shown = selectVerifiedMentions(demo);
    expect(shown).toHaveLength(15);
    expect(shown.every((mention) => mention.sourceUrl.startsWith("https://"))).toBe(true);
    expect(shown[0]?.externalId).toBe("M15");
    expect(shown.at(-1)?.externalId).toBe("M01");
    const counts = new Map<string, number>();
    for (const mention of shown) {
      counts.set(mention.symbol, (counts.get(mention.symbol) ?? 0) + 1);
    }
    expect(counts.get("DELL")).toBe(5);
    expect(counts.get("INTC")).toBe(4);
    expect(counts.get("X")).toBe(1);
  });

  it("el respaldo de Inverse Cramer son 27 citas cortas con fuente, y un pendiente no se muestra", () => {
    const demo = demoCramerMentions();
    expect(demo).toHaveLength(27);
    expect(demo.every((mention) => (mention.quote.trim().match(/\S+/g) ?? []).length <= 10)).toBe(true);
    expect(demo.every((mention) => mention.sourceUrls[0]?.includes("/cramers-lightning-round-"))).toBe(true);
    const shown = selectVerifiedMentions([
      ...demo,
      row({ id: "pend", status: "pendiente", kind: "recomienda_compra", symbol: "WAIT", quote: "hold" }),
    ]);
    expect(shown).toHaveLength(27);
    expect(shown.some((mention) => mention.symbol === "WAIT")).toBe(false);
    const rddt = shown.find((mention) => mention.externalId === "2026-10-15-RDDT");
    expect(recluActionLabel(rddt?.kind ?? null, rddt?.symbol ?? "")).toBe("Corto RDDT");
  });
});
