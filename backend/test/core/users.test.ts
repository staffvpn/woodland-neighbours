import { describe, it, expect } from "vitest";
import { shouldBeFounder } from "../../src/core/users";

describe("shouldBeFounder", () => {
  it("is true when no users exist yet", () => {
    expect(shouldBeFounder(0)).toBe(true);
  });

  it("is false once at least one user exists", () => {
    expect(shouldBeFounder(1)).toBe(false);
    expect(shouldBeFounder(50)).toBe(false);
  });
});
