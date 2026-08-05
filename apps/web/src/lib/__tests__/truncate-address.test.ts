import { describe, it, expect } from "vitest";
import { truncateAddress } from "@bezamint/shared";

describe("truncateAddress", () => {
  it("truncates long address", () => {
    const a = "GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ1234";
    expect(truncateAddress(a)).toBe("GABC...1234");
  });
  it("returns short address unchanged", () => {
    expect(truncateAddress("GABC")).toBe("GABC");
  });
});
