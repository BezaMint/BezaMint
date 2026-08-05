import { describe, it, expect } from "vitest";
import { formatBasisPoints } from "@bezamint/shared";

describe("formatBasisPoints", () => {
  it("formats 500 bps as 5%", () => {
    expect(formatBasisPoints(500)).toBe("5.00%");
  });
  it("formats 10000 bps as 100%", () => {
    expect(formatBasisPoints(10000)).toBe("100.00%");
  });
  it("formats 0 bps as 0%", () => {
    expect(formatBasisPoints(0)).toBe("0.00%");
  });
});
