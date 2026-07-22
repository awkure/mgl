import { describe, expect, it } from "vitest";
import { placeFilterMenuPanel } from "../src/components/filterMenuPosition";

describe("placeFilterMenuPanel", () => {
  it("places the panel below the trigger when space allows", () => {
    const next = placeFilterMenuPanel(
      { top: 40, left: 100, bottom: 68, right: 180, width: 80, height: 28 },
      { width: 210, height: 120 },
      { width: 1280, height: 800 },
    );
    expect(next.top).toBe(72);
    expect(next.left).toBe(100);
    expect(next.minWidth).toBe(210);
  });

  it("flips above the trigger near the bottom edge", () => {
    const next = placeFilterMenuPanel(
      { top: 700, left: 40, bottom: 728, right: 120, width: 80, height: 28 },
      { width: 210, height: 180 },
      { width: 1280, height: 800 },
    );
    expect(next.top).toBe(700 - 4 - 180);
    expect(next.left).toBe(40);
  });

  it("clamps horizontally into the viewport", () => {
    const next = placeFilterMenuPanel(
      { top: 40, left: 1200, bottom: 68, right: 1280, width: 80, height: 28 },
      { width: 210, height: 80 },
      { width: 1280, height: 800 },
    );
    expect(next.left).toBe(1280 - 210 - 8);
  });
});
