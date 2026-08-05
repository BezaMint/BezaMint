import { describe, it, expect } from "vitest";
import { formatAddress, isValidStellarAddress } from "@/services/stellar";

describe("formatAddress", () => {
  it("truncates address", () => {
    const a = "GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ1234";
    expect(formatAddress(a)).toBe("GABC...1234");
  });
  it("keeps short address", () => {
    expect(formatAddress("GABC")).toBe("GABC");
  });
});

describe("isValidStellarAddress", () => {
  it("validates real address format", () => {
    expect(isValidStellarAddress("GBMQK57VHOA7TIA3PCEFFFVOFYEV2VVPLPGEMU5QLXYJA5WVCRAICRHU")).toBe(true);
  });
  it("rejects bad format", () => {
    expect(isValidStellarAddress("bad")).toBe(false);
  });
});
