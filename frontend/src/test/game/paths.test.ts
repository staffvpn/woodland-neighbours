import { describe, it, expect } from "vitest";
import { computePathSegments } from "../../game/paths";

const CAMPFIRE = { x: 0, y: 0 };

describe("computePathSegments", () => {
  it("returns no segments for an empty village", () => {
    expect(computePathSegments([], CAMPFIRE)).toEqual([]);
  });

  it("connects a single house directly to the campfire", () => {
    const house = { x: 10, y: 0 };
    const segments = computePathSegments([house], CAMPFIRE);
    expect(segments).toEqual([[CAMPFIRE, house]]);
  });

  it("connects the second house to whichever prior node (campfire or first house) is nearest", () => {
    const first = { x: 10, y: 0 };
    const second = { x: 11, y: 0 };
    const segments = computePathSegments([first, second], CAMPFIRE);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toEqual([CAMPFIRE, first]);
    expect(segments[1]).toEqual([first, second]);
  });

  it("produces one segment per house, regardless of house count", () => {
    const houses = Array.from({ length: 8 }, (_, i) => ({ x: i * 3, y: i % 2 === 0 ? 5 : -5 }));
    const segments = computePathSegments(houses, CAMPFIRE);
    expect(segments).toHaveLength(houses.length);
  });
});
