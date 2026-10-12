import { describe, it, expect } from "vitest";
import { disclosureLagLabel } from "@/lib/disclosure-lag";

describe("disclosureLagLabel", () => {
  it("counts calendar days from tx_date to disclosed", () => {
    expect(
      disclosureLagLabel({ tx_date: "2024-01-01", disclosed: "2024-02-15" }),
    ).toBe("Declarado 45 días después de la operación");
  });

  it("returns null when either date is missing", () => {
    expect(disclosureLagLabel({})).toBeNull();
    expect(disclosureLagLabel({ tx_date: "2024-01-01" })).toBeNull();
    expect(disclosureLagLabel({ disclosed: "2024-02-15" })).toBeNull();
  });

  it("returns null for unparseable dates", () => {
    expect(disclosureLagLabel({ tx_date: "ayer", disclosed: "2024-02-15" })).toBeNull();
    expect(disclosureLagLabel({ tx_date: "2024-02-31", disclosed: "2024-03-01" })).toBeNull();
  });
});
