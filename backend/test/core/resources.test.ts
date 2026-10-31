import { describe, it, expect } from "vitest";
import { isNodeAvailable, nextRespawnAt, RESPAWN_HOURS } from "../../src/core/resources";

const NOW = 1_800_000_000_000;

describe("isNodeAvailable", () => {
  it("is true when available flag is true, regardless of respawns_at", () => {
    expect(isNodeAvailable(true, null, NOW)).toBe(true);
  });

  it("is false when unavailable and respawn time hasn't arrived", () => {
    expect(isNodeAvailable(false, NOW + 1000, NOW)).toBe(false);
  });

  it("is true when unavailable but respawn time has passed", () => {
    expect(isNodeAvailable(false, NOW - 1000, NOW)).toBe(true);
  });

  it("is true exactly at the respawn boundary", () => {
    expect(isNodeAvailable(false, NOW, NOW)).toBe(true);
  });
});

describe("nextRespawnAt", () => {
  it("returns now plus RESPAWN_HOURS", () => {
    expect(nextRespawnAt(NOW)).toBe(NOW + RESPAWN_HOURS * 60 * 60 * 1000);
  });
});
