import { describe, it, expect } from "vitest";
import { formatXlm } from "@bezamint/shared";

describe("formatXlm", () => {
  it("formats number with 7 decimals and XLM suffix", () => {
    expect(formatXlm(10)).toBe("10.0000000 XLM");
  });
  it("formats decimal amount", () => {
    expect(formatXlm(3.14)).toBe("3.1400000 XLM");
  });
  it("handles zero", () => {
    expect(formatXlm(0)).toBe("0.0000000 XLM");
  });
});
