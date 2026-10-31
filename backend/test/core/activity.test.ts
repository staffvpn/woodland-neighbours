import { describe, it, expect } from "vitest";
import { hasSmoke, isOvergrown, isOnline, SMOKE_WINDOW_MS, OVERGROWN_WINDOW_MS, ONLINE_WINDOW_MS } from "../../src/core/activity";

const NOW = 1_800_000_000_000;

describe("hasSmoke", () => {
  it("is true just under the 3-day window", () => {
    expect(hasSmoke(NOW - SMOKE_WINDOW_MS + 1000, NOW)).toBe(true);
  });
  it("is false just over the 3-day window", () => {
    expect(hasSmoke(NOW - SMOKE_WINDOW_MS - 1000, NOW)).toBe(false);
  });
});

describe("isOvergrown", () => {
  it("is false just under the 14-day window", () => {
    expect(isOvergrown(NOW - OVERGROWN_WINDOW_MS + 1000, NOW)).toBe(false);
  });
  it("is true just over the 14-day window", () => {
    expect(isOvergrown(NOW - OVERGROWN_WINDOW_MS - 1000, NOW)).toBe(true);
  });
});

describe("isOnline", () => {
  it("is true just under the 2-minute window", () => {
    expect(isOnline(NOW - ONLINE_WINDOW_MS + 1000, NOW)).toBe(true);
  });
  it("is false just over the 2-minute window", () => {
    expect(isOnline(NOW - ONLINE_WINDOW_MS - 1000, NOW)).toBe(false);
  });
});
