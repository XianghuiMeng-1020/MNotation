import { describe, expect, it } from "vitest";
import { percentAgreement } from "./irrCalc";

describe("percentAgreement", () => {
  it("returns 1 for perfectly matching labels", () => {
    const matrix = [
      { itemId: "a", labels: { u1: "CODE", u2: "CODE", u3: "CODE" } },
      { itemId: "b", labels: { u1: "APP", u2: "APP", u3: "APP" } }
    ];
    expect(percentAgreement(matrix)).toBe(1);
  });

  it("returns 0 when all pairwise labels disagree", () => {
    const matrix = [
      { itemId: "x", labels: { u1: "A", u2: "B" } },
      { itemId: "y", labels: { u1: "C", u2: "D" } }
    ];
    expect(percentAgreement(matrix)).toBe(0);
  });
});
