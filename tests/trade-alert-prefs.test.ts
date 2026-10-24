import { describe, expect, it } from "vitest";
import { mergeTradeAlertPrefs } from "@/lib/trade-alert-prefs";

describe("preferencias de compra/venta", () => {
  it("sin fila = ambos activados; respeta false", () => {
    const out = mergeTradeAlertPrefs(
      [{ id: "b", slug: "b", name: "Berkshire" }, { id: "a", slug: "a", name: "ARK" }],
      [{ portfolio_id: "b", email_buys: false, email_sells: true }],
    );
    expect(out.map((p) => [p.name, p.emailBuys, p.emailSells])).toEqual([["ARK", true, true], ["Berkshire", false, true]]);
  });
});
