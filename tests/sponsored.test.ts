import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  SPONSORABLE_PLACEMENTS,
  SponsoredSlot,
  isSponsorsEnabled,
  type SponsorshipPlacement,
} from "@/components/sponsored-slot";
import { SPONSORED_LABEL } from "@/lib/legal";

const VALID_PROPS = {
  name: "Corredora Ejemplo",
  url: "https://example.com/oferta",
  text: "Abre tu cuenta sin costo de mantención.",
  placement: "explore" as SponsorshipPlacement,
};

const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_SPONSORS_ENABLED;

function setFlag(value: string | undefined) {
  if (value === undefined) delete process.env.NEXT_PUBLIC_SPONSORS_ENABLED;
  else process.env.NEXT_PUBLIC_SPONSORS_ENABLED = value;
}

function render(overrides: Partial<typeof VALID_PROPS> = {}) {
  return renderToStaticMarkup(
    createElement(SponsoredSlot, { ...VALID_PROPS, ...overrides }),
  );
}

afterEach(() => setFlag(ORIGINAL_FLAG));

describe("patrocinios", () => {
  it("con el flag apagado no se renderiza", () => {
    setFlag(undefined);
    expect(isSponsorsEnabled()).toBe(false);
    expect(render()).toBe("");

    setFlag("false");
    expect(isSponsorsEnabled()).toBe(false);
    expect(render()).toBe("");
  });

  it("con el flag encendido la etiqueta siempre está", () => {
    setFlag("true");
    expect(isSponsorsEnabled()).toBe(true);

    const html = render();
    expect(html).toContain(SPONSORED_LABEL);
    expect(html).toContain("Patrocinado");
    expect(html).toContain(VALID_PROPS.name);
    expect(html).toContain('href="https://example.com/oferta"');
    expect(html).toContain('rel="sponsored noopener noreferrer nofollow"');
  });

  it("solo admite ubicaciones editoriales, nunca portafolio ni alertas", () => {
    setFlag("true");
    expect(SPONSORABLE_PLACEMENTS).not.toContain("portfolio");
    expect(SPONSORABLE_PLACEMENTS).not.toContain("alerts");
    expect(render({ placement: "portfolio" as SponsorshipPlacement })).toBe("");
    expect(render({ placement: "alerts" as SponsorshipPlacement })).toBe("");
  });

  it("descarta enlaces que no sean https", () => {
    setFlag("true");
    expect(render({ url: "http://example.com" })).toBe("");
    expect(render({ url: "javascript:alert(1)" })).toBe("");
  });
});
