import { describe, it, expect, vi } from "vitest";
import { throttle } from "@/lib/throttle";

describe("throttle", () => {
  it("limits function calls within interval", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled(); throttled(); throttled();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
