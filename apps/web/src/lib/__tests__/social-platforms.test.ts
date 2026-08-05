import { describe, it, expect } from "vitest";
import { getAllSocialPlatforms } from "@/lib/socialPlatforms";

describe("getAllSocialPlatforms", () => {
  it("returns array of platforms", () => {
    const platforms = getAllSocialPlatforms();
    expect(Array.isArray(platforms)).toBe(true);
    expect(platforms.length).toBeGreaterThan(0);
  });
  it("each platform has id and label", () => {
    for (const p of getAllSocialPlatforms()) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
    }
  });
});
