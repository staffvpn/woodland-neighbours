import { describe, it, expect } from "vitest";
import { sunState } from "../../game/daynight";

describe("sunState", () => {
  it("is at peak elevation at solar noon", () => {
    const noon = new Date(Date.UTC(2026, 9, 31, 12, 0, 0));
    expect(sunState(noon).elevationDeg).toBeCloseTo(90, 0);
  });

  it("is at its lowest at midnight", () => {
    const midnight = new Date(Date.UTC(2026, 9, 31, 0, 0, 0));
    expect(sunState(midnight).elevationDeg).toBeCloseTo(-90, 0);
  });

  it("has low intensity at midnight and high intensity at noon", () => {
    const midnight = new Date(Date.UTC(2026, 9, 31, 0, 0, 0));
    const noon = new Date(Date.UTC(2026, 9, 31, 12, 0, 0));
    expect(sunState(midnight).intensity).toBeLessThan(sunState(noon).intensity);
  });

  it("returns a warm-toned color near sunrise/sunset and a cool color at night", () => {
    const night = sunState(new Date(Date.UTC(2026, 9, 31, 2, 0, 0)));
    const dawn = sunState(new Date(Date.UTC(2026, 9, 31, 6, 30, 0)));
    expect(night.colorHex).not.toBe(dawn.colorHex);
  });

  it("is symmetric around noon for elevation", () => {
    const before = sunState(new Date(Date.UTC(2026, 9, 31, 10, 0, 0)));
    const after = sunState(new Date(Date.UTC(2026, 9, 31, 14, 0, 0)));
    expect(before.elevationDeg).toBeCloseTo(after.elevationDeg, 0);
  });
});
