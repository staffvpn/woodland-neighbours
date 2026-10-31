import { describe, it, expect } from "vitest";
import { startOfUtcDayMs, hasReachedDailyLimit, DAILY_GIFT_LIMIT } from "../../src/core/gifts";

describe("startOfUtcDayMs", () => {
  it("returns midnight UTC for a timestamp mid-day", () => {
    const mid = Date.UTC(2026, 9, 31, 15, 30, 0);
    expect(startOfUtcDayMs(mid)).toBe(Date.UTC(2026, 9, 31, 0, 0, 0));
  });

  it("returns the same timestamp when already exactly midnight UTC", () => {
    const midnight = Date.UTC(2026, 9, 31, 0, 0, 0);
    expect(startOfUtcDayMs(midnight)).toBe(midnight);
  });

  it("rolls over correctly just after midnight UTC", () => {
    const justAfter = Date.UTC(2026, 9, 31, 0, 0, 1);
    expect(startOfUtcDayMs(justAfter)).toBe(Date.UTC(2026, 9, 31, 0, 0, 0));
  });

  it("does not leak into the next day for a timestamp just before midnight", () => {
    const justBefore = Date.UTC(2026, 9, 30, 23, 59, 59);
    expect(startOfUtcDayMs(justBefore)).toBe(Date.UTC(2026, 9, 30, 0, 0, 0));
  });
});

describe("hasReachedDailyLimit", () => {
  it(`is false below ${DAILY_GIFT_LIMIT}`, () => {
    expect(hasReachedDailyLimit(0)).toBe(false);
    expect(hasReachedDailyLimit(DAILY_GIFT_LIMIT - 1)).toBe(false);
  });

  it(`is true at or above ${DAILY_GIFT_LIMIT}`, () => {
    expect(hasReachedDailyLimit(DAILY_GIFT_LIMIT)).toBe(true);
    expect(hasReachedDailyLimit(DAILY_GIFT_LIMIT + 5)).toBe(true);
  });
});
