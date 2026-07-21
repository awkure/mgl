import { describe, expect, it } from "vitest";
import {
  SWIPE_EDGE_GUARD_PX,
  SWIPE_THRESHOLD_PX,
  isNearScreenEdge,
  shouldArmSwipe,
  swipeDirection,
} from "../src/hooks/useSwipeNavigation";

describe("swipe navigation helpers", () => {
  it("guards screen edges for Safari back/forward swipe", () => {
    expect(isNearScreenEdge(0, 390)).toBe(true);
    expect(isNearScreenEdge(SWIPE_EDGE_GUARD_PX, 390)).toBe(true);
    expect(isNearScreenEdge(SWIPE_EDGE_GUARD_PX + 1, 390)).toBe(false);
    expect(isNearScreenEdge(390 - SWIPE_EDGE_GUARD_PX, 390)).toBe(true);
    expect(isNearScreenEdge(200, 390)).toBe(false);
  });

  it("arms only on horizontal-dominant movement", () => {
    expect(shouldArmSwipe(20, 4)).toBe(true);
    expect(shouldArmSwipe(4, 20)).toBe(false);
    expect(shouldArmSwipe(5, 5)).toBe(false);
  });

  it("maps dx past threshold to swipe direction", () => {
    expect(swipeDirection(0)).toBeNull();
    expect(swipeDirection(SWIPE_THRESHOLD_PX - 1)).toBeNull();
    expect(swipeDirection(SWIPE_THRESHOLD_PX)).toBe("right");
    expect(swipeDirection(-SWIPE_THRESHOLD_PX)).toBe("left");
  });
});
