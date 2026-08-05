import { describe, it, expect, vi } from "vitest";
import { isFreighterInstalled, getFreighterApi } from "@/lib/freighter";

describe("isFreighterInstalled", () => {
  it("returns false when stellar is absent", () => {
    vi.stubGlobal("window", {});
    expect(isFreighterInstalled()).toBe(false);
    vi.unstubAllGlobals();
  });
  it("returns true when stellar is available", () => {
    vi.stubGlobal("window", { stellar: { isConnected: () => true } });
    expect(isFreighterInstalled()).toBe(true);
    vi.unstubAllGlobals();
  });
});
