import { describe, expect, it } from "vitest";
import {
  SWIPE_EDGE_GUARD_PX,
  SWIPE_THRESHOLD_PX,
  clampPagerDrag,
  isNearScreenEdge,
  nextPagerIndex,
  pagerIndexToPath,
  routeToPagerIndex,
  shouldArmSwipe,
  shouldCommitPagerSwipe,
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

  it("maps routes to pager indexes", () => {
    expect(routeToPagerIndex("/")).toBe(0);
    expect(routeToPagerIndex("/games")).toBe(1);
    expect(pagerIndexToPath(0)).toBe("/");
    expect(pagerIndexToPath(1)).toBe("/games");
  });

  it("commits swipe by distance ratio or velocity", () => {
    expect(shouldCommitPagerSwipe(-100, 400, 0)).toBe("left");
    expect(shouldCommitPagerSwipe(100, 400, 0)).toBe("right");
    expect(shouldCommitPagerSwipe(-50, 400, 0)).toBeNull();
    expect(shouldCommitPagerSwipe(-10, 400, -0.5)).toBe("left");
    expect(shouldCommitPagerSwipe(10, 400, 0.5)).toBe("right");
  });

  it("clamps rubber-band at pager ends", () => {
    expect(clampPagerDrag(40, 0, 400)).toBe(10);
    expect(clampPagerDrag(-40, 1, 400)).toBe(-10);
    expect(clampPagerDrag(-40, 0, 400)).toBe(-40);
  });

  it("advances pager index from swipe direction", () => {
    expect(nextPagerIndex(0, "left")).toBe(1);
    expect(nextPagerIndex(0, "right")).toBeNull();
    expect(nextPagerIndex(1, "right")).toBe(0);
    expect(nextPagerIndex(1, "left")).toBeNull();
  });
});
