import { describe, expect, it } from "vitest";
import { nearestTabFromPressProgress, pressProgressFromClientX } from "../src/components/tabBarPress";

describe("pressProgressFromClientX", () => {
  const barLeft = 100;
  const barWidth = 400;
  const tabCount = 4;

  it("maps each tab center to integer progress 0..3", () => {
    for (let i = 0; i < tabCount; i += 1) {
      const centerX = barLeft + ((i + 0.5) / tabCount) * barWidth;
      expect(pressProgressFromClientX(centerX, barLeft, barWidth, tabCount)).toBeCloseTo(i, 5);
    }
  });

  it("interpolates between adjacent tab centers", () => {
    const mid = barLeft + (1 / tabCount) * barWidth; // boundary between tab 0 and 1
    expect(pressProgressFromClientX(mid, barLeft, barWidth, tabCount)).toBeCloseTo(0.5, 5);
  });

  it("clamps to [0, tabCount-1]", () => {
    expect(pressProgressFromClientX(barLeft - 50, barLeft, barWidth, tabCount)).toBe(0);
    expect(pressProgressFromClientX(barLeft + barWidth + 50, barLeft, barWidth, tabCount)).toBe(3);
  });

  it("returns 0 for non-positive width", () => {
    expect(pressProgressFromClientX(120, barLeft, 0, tabCount)).toBe(0);
  });
});

describe("nearestTabFromPressProgress", () => {
  it("rounds to nearest tab id for four-tab bar", () => {
    expect(nearestTabFromPressProgress(0)).toBe("tiers");
    expect(nearestTabFromPressProgress(0.4)).toBe("tiers");
    expect(nearestTabFromPressProgress(0.6)).toBe("catalog");
    expect(nearestTabFromPressProgress(1.5)).toBe("history");
    expect(nearestTabFromPressProgress(2.6)).toBe("settings");
    expect(nearestTabFromPressProgress(3)).toBe("settings");
  });
});
