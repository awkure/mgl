import { describe, expect, it } from "vitest";
import {
  contentStretch,
  dampPull,
  isAtScrollTop,
  isHorizontalGesture,
  PTR_ARM_PX,
  PTR_MAX_OFFSET_PX,
  PTR_MAX_STRETCH,
  PTR_THRESHOLD_PX,
  pullProgress,
  shouldArmPull,
  shouldRefresh,
} from "../src/hooks/usePullToRefresh";

describe("pull-to-refresh helpers", () => {
  it("treats near-zero scroll as top", () => {
    expect(isAtScrollTop(0)).toBe(true);
    expect(isAtScrollTop(0.5)).toBe(true);
    expect(isAtScrollTop(2)).toBe(false);
  });

  it("arms only on clear downward vertical pull", () => {
    expect(shouldArmPull(0, PTR_ARM_PX + 1)).toBe(true);
    expect(shouldArmPull(0, PTR_ARM_PX)).toBe(false);
    expect(shouldArmPull(20, 10)).toBe(false);
    expect(shouldArmPull(5, 20)).toBe(true);
  });

  it("detects horizontal gestures before arm", () => {
    expect(isHorizontalGesture(20, 5)).toBe(true);
    expect(isHorizontalGesture(5, 20)).toBe(false);
    expect(isHorizontalGesture(4, 4)).toBe(false);
  });

  it("damps with rubber-band curve and caps pull offset", () => {
    expect(dampPull(-10)).toBe(0);
    expect(dampPull(0)).toBe(0);
    expect(dampPull(40)).toBeLessThan(40);
    expect(dampPull(100)).toBeLessThan(dampPull(40) * (100 / 40));
    expect(dampPull(10_000)).toBe(PTR_MAX_OFFSET_PX);
    expect(dampPull(144)).toBeCloseTo(PTR_THRESHOLD_PX, 0);
  });

  it("stretches content scale with pull offset", () => {
    expect(contentStretch(0)).toBe(1);
    expect(contentStretch(PTR_MAX_OFFSET_PX)).toBeCloseTo(1 + PTR_MAX_STRETCH);
    expect(contentStretch(PTR_MAX_OFFSET_PX / 2)).toBeCloseTo(1 + PTR_MAX_STRETCH / 2);
  });

  it("triggers refresh at threshold", () => {
    expect(shouldRefresh(PTR_THRESHOLD_PX - 1)).toBe(false);
    expect(shouldRefresh(PTR_THRESHOLD_PX)).toBe(true);
    expect(shouldRefresh(PTR_MAX_OFFSET_PX)).toBe(true);
  });

  it("scales progress to threshold", () => {
    expect(pullProgress(0)).toBe(0);
    expect(pullProgress(PTR_THRESHOLD_PX / 2)).toBe(0.5);
    expect(pullProgress(PTR_THRESHOLD_PX)).toBe(1);
    expect(pullProgress(PTR_MAX_OFFSET_PX)).toBe(1);
  });
});
