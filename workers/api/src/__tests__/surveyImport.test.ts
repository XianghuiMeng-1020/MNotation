import { describe, expect, it } from "vitest";
import { extractQualtricsTexts } from "../surveyImport";

describe("extractQualtricsTexts", () => {
  it("reads responses[].values", () => {
    const j = {
      responses: [
        { values: { QID1_TEXT: "hello", QID2: 1 } },
        { values: { QID1_TEXT: "world" } }
      ]
    };
    expect(extractQualtricsTexts(j)).toEqual(["hello", "world"]);
  });

  it("uses explicit text field", () => {
    const j = { responses: [{ values: { QID9_TEXT: "x", QID1_TEXT: "y" } }] };
    expect(extractQualtricsTexts(j, "QID9_TEXT")).toEqual(["x"]);
  });
});
