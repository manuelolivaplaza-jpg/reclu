import { describe, expect, it } from "vitest";
import {
  AFP_MODELO_SLUG,
  enlaceSpensiones,
  fechaCartera,
  latestAsOf,
  sourceUrlAlertaAfp,
  urlFuenteAfpModelo,
} from "@/lib/afp-fuente";

const CUADRO_202605 =
  "https://www.spensiones.cl/apps/carteras/genera_desagregada_xsl.php?fecpro=202605&idu=50&listado=14";

describe("fuente AFP Modelo", () => {
  it("formatea el corte de la semilla como 29-05-2026", () => {
    expect(fechaCartera("2026-05-29")).toBe("29-05-2026");
  });

  it("arma el cuadro 14 de mayo 2026 y no acepta otra fuente", () => {
    expect(urlFuenteAfpModelo("2026-05-29")).toBe(CUADRO_202605);
    expect(sourceUrlAlertaAfp({ slug: AFP_MODELO_SLUG, source: "spensiones" }, "2026-05-29")).toBe(
      CUADRO_202605,
    );
    expect(sourceUrlAlertaAfp({ slug: "afp-consenso-chile", source: "spensiones" }, "2026-05-29")).toBe(
      null,
    );
    expect(sourceUrlAlertaAfp({ slug: AFP_MODELO_SLUG, source: "renta4" }, "2026-05-29")).toBe(null);
    expect(sourceUrlAlertaAfp({ slug: AFP_MODELO_SLUG, source: "spensiones" }, null)).toBe(null);
  });

  it("sin fecha visible, el enlace de la ficha cae al último cuadro publicado", () => {
    expect(urlFuenteAfpModelo(null)).toBe(CUADRO_202605);
  });

  it("toma el as_of más nuevo de los holdings ya recortados", () => {
    expect(
      latestAsOf([
        { as_of: "2026-05-29" },
        { as_of: "2025-05-30" },
        { as_of: "no-fecha" },
      ]),
    ).toBe("2026-05-29");
  });

  it("solo enlaza alertas cuyo payload apunta a spensiones.cl", () => {
    expect(enlaceSpensiones(CUADRO_202605)).toBe(CUADRO_202605);
    expect(enlaceSpensiones("http://www.spensiones.cl/apps/carteras/")).toBeNull();
    expect(enlaceSpensiones("https://example.com/cuadro")).toBeNull();
  });
});
