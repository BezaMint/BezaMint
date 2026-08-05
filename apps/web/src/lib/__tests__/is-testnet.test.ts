import { describe, it, expect } from "vitest";
import { isTestnet } from "@bezamint/shared";

describe("isTestnet", () => {
  it("returns true when env is testnet", () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
    expect(isTestnet()).toBe(true);
  });
  it("returns false when env is mainnet", () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "mainnet";
    expect(isTestnet()).toBe(false);
  });
});
