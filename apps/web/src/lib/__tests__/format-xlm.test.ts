import { describe, it, expect } from "vitest";
import { formatXlm } from "@bezamint/shared";

describe("formatXlm", () => {
  it("formats number with 4 decimals", () => {
    expect(formatXlm(10)).toBe("10.0000");
  });
  it("formats string amount", () => {
    expect(formatXlm("3.14")).toBe("3.1400");
  });
  it("handles NaN", () => {
    expect(formatXlm("abc")).toBe("0.0000");
  });
});
