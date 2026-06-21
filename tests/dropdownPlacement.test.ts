import { describe, it, expect } from "vitest";
import { clampLeft } from "../lib/dropdownPlacement";

describe("clampLeft", () => {
  const VW = 375; // a phone-width viewport

  it("keeps the anchor when the dropdown already fits", () => {
    // model chip at x=186, 127px wide → right edge 313, fits within 375
    expect(clampLeft(186, 127, VW)).toBe(186);
  });

  it("shifts left so a wide dropdown does not bleed off the right edge", () => {
    // 300px wide at x=186 would reach 486 (off-screen); shift to 375-300-8 = 67
    expect(clampLeft(186, 300, VW)).toBe(67);
  });

  it("never shifts past the left margin", () => {
    expect(clampLeft(4, 100, VW)).toBe(8);
    expect(clampLeft(-20, 100, VW)).toBe(8);
  });

  it("pins to the left margin when the content is wider than the viewport", () => {
    expect(clampLeft(186, 400, VW)).toBe(8);
  });

  it("respects a custom margin", () => {
    expect(clampLeft(370, 50, VW, 4)).toBe(VW - 50 - 4); // 321
  });
});
