import { describe, it, expect, vi } from "vitest";
import { copyToClipboard } from "@/lib/clipboard";

describe("copyToClipboard", () => {
  it("calls navigator.clipboard.writeText", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const result = await copyToClipboard("test");
    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith("test");
  });
});
