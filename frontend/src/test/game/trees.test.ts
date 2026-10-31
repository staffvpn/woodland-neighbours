import { describe, it, expect } from "vitest";
import { generateForestCandidates } from "../../game/trees";

describe("generateForestCandidates (I7 fix)", () => {
  it("is deterministic for the same seed and count", () => {
    const a = generateForestCandidates(1337, 20);
    const b = generateForestCandidates(1337, 20);
    expect(a).toEqual(b);
  });

  it("a candidate's x/z/rotation/scale never depend on how many candidates are generated overall (regression: clearing-radius changes must not reshuffle the forest)", () => {
    const longer = generateForestCandidates(1337, 30);
    const shorter = generateForestCandidates(1337, 10);
    expect(shorter).toEqual(longer.slice(0, 10));
  });
});
