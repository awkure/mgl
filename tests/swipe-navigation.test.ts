import { describe, expect, it } from "vitest";
import {
  SWIPE_EDGE_GUARD_PX,
  SWIPE_THRESHOLD_PX,
  clampPagerDrag,
  isNearScreenEdge,
  nextPagerIndex,
  pagerIndexToPath,
  pagerProgress,
  pagerTrackTranslate,
  pagerTrackTranslateFromProgress,
  routeToPagerIndex,
  shouldArmSwipe,
  shouldCommitPagerSwipe,
  swipeDirection,
} from "../src/hooks/useSwipeNavigation";
import { tabProgressFromRoute } from "../src/components/AppShell";

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
    expect(routeToPagerIndex("/history")).toBe(2);
    expect(routeToPagerIndex("/settings")).toBe(3);
    expect(pagerIndexToPath(0)).toBe("/");
    expect(pagerIndexToPath(1)).toBe("/games");
    expect(pagerIndexToPath(2)).toBe("/history");
    expect(pagerIndexToPath(3)).toBe("/settings");
  });

  it("maps app routes to tab blob progress", () => {
    expect(tabProgressFromRoute("tiers")).toBe(0);
    expect(tabProgressFromRoute("catalog")).toBe(1);
    expect(tabProgressFromRoute("game")).toBe(1);
    expect(tabProgressFromRoute("new")).toBe(1);
    expect(tabProgressFromRoute("history")).toBe(2);
    expect(tabProgressFromRoute("settings")).toBe(3);
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
    expect(clampPagerDrag(-40, 3, 400)).toBe(-10);
    expect(clampPagerDrag(-40, 0, 400)).toBe(-40);
    expect(clampPagerDrag(40, 1, 400)).toBe(40);
  });

  it("advances pager index from swipe direction", () => {
    expect(nextPagerIndex(0, "left")).toBe(1);
    expect(nextPagerIndex(1, "left")).toBe(2);
    expect(nextPagerIndex(2, "left")).toBe(3);
    expect(nextPagerIndex(0, "right")).toBeNull();
    expect(nextPagerIndex(3, "right")).toBe(2);
    expect(nextPagerIndex(2, "right")).toBe(1);
    expect(nextPagerIndex(1, "right")).toBe(0);
    expect(nextPagerIndex(3, "left")).toBeNull();
  });

  it("computes fractional pager progress from drag", () => {
    expect(pagerProgress(0, 0, 390)).toBe(0);
    expect(pagerProgress(1, 0, 390)).toBe(1);
    expect(pagerProgress(0, -78, 390)).toBe(78 / 390);
    expect(pagerProgress(1, 78, 390)).toBe(1 - 78 / 390);
  });

  it("translates track from progress without snapping through old base", () => {
    const mid = pagerProgress(0, -156, 390);
    expect(mid).toBeCloseTo(0.4);
    const midTranslate = pagerTrackTranslateFromProgress(mid);
    const settled = pagerTrackTranslateFromProgress(1);
    expect(midTranslate).toBe(`translate3d(${-mid * (100 / 4)}%, 0, 0)`);
    expect(settled).toBe(`translate3d(${-100 / 4}%, 0, 0)`);
    // Commit path: progress moves mid → next integer; never jumps to 0% first.
    expect(midTranslate).not.toBe(pagerTrackTranslateFromProgress(0));
  });

  it("translates track by one panel step of a 400% track", () => {
    expect(pagerTrackTranslate(0, 0, 390)).toBe("translate3d(0%, 0, 0)");
    expect(pagerTrackTranslate(1, 0, 390)).toBe(`translate3d(${-100 / 4}%, 0, 0)`);
    expect(pagerTrackTranslate(2, 0, 390)).toBe(`translate3d(${-200 / 4}%, 0, 0)`);
    expect(pagerTrackTranslate(3, 0, 390)).toBe(`translate3d(${-300 / 4}%, 0, 0)`);
    expect(pagerTrackTranslate(0, -78, 390)).toBe(`translate3d(${-(78 / 390) * (100 / 4)}%, 0, 0)`);
  });
});
