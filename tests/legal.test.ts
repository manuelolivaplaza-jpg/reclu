import { describe, expect, it } from "vitest";
import {
  FINTEC_NOTICE,
  LEGAL_NOTICES,
  LEGAL_PAGE_LINKS,
  SIMULATION_NOTICE,
  SPONSORED_LABEL,
  TAX_NOTICE,
  US_DISCLOSURE_NOTICE,
  US_DISCLOSURE_SOURCES,
  type LegalNoticeKind,
} from "@/lib/legal";

const KINDS: LegalNoticeKind[] = [
  "fintec",
  "simulation",
  "us_disclosure",
  "tax",
  "sponsored",
];

describe("descargos legales", () => {
  it("fija el texto de la Ley Fintec", () => {
    expect(FINTEC_NOTICE).toBe(
      "reclu.cl entrega información pública con fines informativos. No ejecuta órdenes ni da asesoría de inversión personalizada (Ley 21.521).",
    );
    expect(FINTEC_NOTICE).not.toMatch(/recomendamos comprar/i);
  });

  it("fija el texto de la simulación histórica", () => {
    expect(SIMULATION_NOTICE).toBe(
      "Simulación histórica con fines informativos. No es recomendación de inversión.",
    );
  });

  it("deja las declaraciones de EE.UU. gratis y enlaza la fuente oficial", () => {
    expect(US_DISCLOSURE_NOTICE).toContain("gratis");
    expect(US_DISCLOSURE_NOTICE).toContain("5 U.S.C. § 13107");
    expect(US_DISCLOSURE_NOTICE.toLowerCase()).not.toContain("suscri");
    expect(US_DISCLOSURE_SOURCES.map((source) => source.href)).toEqual([
      "https://disclosures-clerk.house.gov/",
      "https://efdsearch.senate.gov/",
    ]);
    for (const source of US_DISCLOSURE_SOURCES) {
      expect(source.href.startsWith("https://")).toBe(true);
      expect(source.label.length).toBeGreaterThan(0);
    }
  });

  it("advierte que las cifras no son asesoría tributaria", () => {
    expect(TAX_NOTICE.toLowerCase()).toContain("impuesto");
    expect(TAX_NOTICE.toLowerCase()).toContain("no es asesoría tributaria");
  });

  it("rotula el contenido patrocinado", () => {
    expect(SPONSORED_LABEL).toBe("Patrocinado");
  });

  it("cubre los cinco tipos y enlaza las páginas legales sin reescribirlas", () => {
    expect(Object.keys(LEGAL_NOTICES).sort()).toEqual([...KINDS].sort());
    for (const kind of KINDS) {
      expect(LEGAL_NOTICES[kind].length).toBeGreaterThan(0);
    }
    expect(LEGAL_PAGE_LINKS.map((link) => link.href)).toEqual([
      "/disclaimer",
      "/terminos",
      "/privacidad",
    ]);
  });
});
