import { describe, it, expect } from "vitest";
import {
  isInRiver,
  settlementRadius,
  findHousePlacement,
  MIN_HOUSE_DISTANCE,
  FOUNDER_POSITION,
  RING_ANGLE_STEP_DEG,
  RING_RADIAL_STEP,
} from "../../src/core/placement";

describe("isInRiver", () => {
  it("is true inside the river band", () => {
    expect(isInRiver({ x: 0, y: 0 })).toBe(true);
    expect(isInRiver({ x: 2.9, y: 50 })).toBe(true);
  });
  it("is false outside the river band", () => {
    expect(isInRiver({ x: 3.1, y: 0 })).toBe(false);
    expect(isInRiver({ x: -10, y: 0 })).toBe(false);
  });
});

describe("settlementRadius", () => {
  it("grows with house count", () => {
    const r0 = settlementRadius(0);
    const r10 = settlementRadius(10);
    const r50 = settlementRadius(50);
    expect(r10).toBeGreaterThan(r0);
    expect(r50).toBeGreaterThan(r10);
  });
});

describe("findHousePlacement", () => {
  it("returns a point outside the river for an empty village", () => {
    const point = findHousePlacement([]);
    expect(isInRiver(point)).toBe(false);
  });

  it("returns a point at least MIN_HOUSE_DISTANCE from every existing house", () => {
    const existing = [{ x: 10, y: 0 }, { x: -10, y: 0 }, { x: 0, y: 10 }];
    const point = findHousePlacement(existing);
    for (const house of existing) {
      const dist = Math.hypot(point.x - house.x, point.y - house.y);
      expect(dist).toBeGreaterThanOrEqual(MIN_HOUSE_DISTANCE);
    }
  });

  it("never returns a point inside the river", () => {
    for (let i = 0; i < 20; i++) {
      const existing = Array.from({ length: i }, (_, idx) => ({ x: idx * 5, y: idx % 2 === 0 ? 5 : -5 }));
      const point = findHousePlacement(existing);
      expect(isInRiver(point)).toBe(false);
    }
  });

  it("throws a clear error when the search space is exhausted", () => {
    // A thin line of houses can never exhaust a 360-degree ring search (it only
    // blocks the handful of angles that point toward it). To genuinely exhaust
    // the search, block every candidate point the algorithm itself would ever
    // generate, for enough rings that the resulting (self-consistent) search
    // radius doesn't outrun the blocked rings. River-band candidates are
    // skipped by the algorithm regardless of houses, so they don't need
    // blocking. RING_COUNT=160 was chosen empirically: with ~5.7k blocking
    // houses the induced search radius only reaches ~ring 152, safely under
    // the 160 rings actually blocked here.
    const RING_COUNT = 160;
    const wall: { x: number; y: number }[] = [];
    for (let ring = 1; ring <= RING_COUNT; ring++) {
      const radius = ring * RING_RADIAL_STEP;
      for (let angleDeg = 0; angleDeg < 360; angleDeg += RING_ANGLE_STEP_DEG) {
        const angleRad = (angleDeg * Math.PI) / 180;
        const candidate = { x: Math.cos(angleRad) * radius, y: Math.sin(angleRad) * radius };
        if (isInRiver(candidate)) continue;
        wall.push(candidate);
      }
    }

    expect(() => findHousePlacement(wall)).toThrow(/no valid placement/i);
  });
});

describe("FOUNDER_POSITION", () => {
  it("is outside the river and close to the campfire at the origin", () => {
    expect(isInRiver(FOUNDER_POSITION)).toBe(false);
    expect(Math.hypot(FOUNDER_POSITION.x, FOUNDER_POSITION.y)).toBeLessThan(10);
  });
});
