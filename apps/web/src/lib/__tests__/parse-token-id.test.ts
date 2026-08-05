import { describe, it, expect } from "vitest";
import { parseTokenId } from "@bezamint/shared";

describe("parseTokenId", () => {
  it("parses valid string", () => {
    expect(parseTokenId("42")).toBe(42);
  });
  it("returns null for zero", () => {
    expect(parseTokenId(0)).toBe(null);
  });
  it("returns null for negative", () => {
    expect(parseTokenId(-1)).toBe(null);
  });
});
