import { describe, expect, it } from "vitest";
import { pagerPanelNear, pagerPanelSlots } from "../src/components/pagerMount";

describe("pagerPanelNear", () => {
  it("is true for active and immediate neighbors only", () => {
    expect(pagerPanelNear(0, 0)).toBe(true);
    expect(pagerPanelNear(1, 0)).toBe(true);
    expect(pagerPanelNear(2, 0)).toBe(false);
    expect(pagerPanelNear(3, 0)).toBe(false);

    expect(pagerPanelNear(0, 1)).toBe(true);
    expect(pagerPanelNear(1, 1)).toBe(true);
    expect(pagerPanelNear(2, 1)).toBe(true);
    expect(pagerPanelNear(3, 1)).toBe(false);

    expect(pagerPanelNear(2, 3)).toBe(true);
    expect(pagerPanelNear(3, 3)).toBe(true);
    expect(pagerPanelNear(1, 3)).toBe(false);
  });
});

describe("pagerPanelSlots", () => {
  it("mounts nothing when far", () => {
    expect(pagerPanelSlots(false, false)).toEqual({ root: false, overlay: false });
    expect(pagerPanelSlots(false, true)).toEqual({ root: false, overlay: false });
  });

  it("mounts root only when near without overlay", () => {
    expect(pagerPanelSlots(true, false)).toEqual({ root: true, overlay: false });
  });

  it("mounts overlay only when near with overlay", () => {
    expect(pagerPanelSlots(true, true)).toEqual({ root: false, overlay: true });
  });
});
