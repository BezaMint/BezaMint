import { describe, it, expect } from "vitest";
import { createMetadata } from "@/lib/metadata";

describe("createMetadata", () => {
  it("generates metadata with title", () => {
    const meta = createMetadata({ title: "Test" });
    expect(meta.title).toBe("Test | BezaMint");
  });
  it("includes OpenGraph", () => {
    const meta = createMetadata({ title: "Test", path: "/test" });
    expect(meta.openGraph?.title).toBe("Test | BezaMint");
  });
});
