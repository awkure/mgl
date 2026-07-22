import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import {
  pagerIndexApplyPlan,
  pagerTrackTranslateFromProgress,
  useSwipePager,
  type PagerIndex,
} from "../src/hooks/useSwipeNavigation";

function PagerHarness({
  index,
  settleKey = "root",
  enabled = true,
}: {
  index: PagerIndex;
  settleKey?: string;
  enabled?: boolean;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  useSwipePager({
    targetRef,
    trackRef,
    index,
    settleKey,
    enabled,
    onCommit: () => { },
  });
  return (
    <div className="swipe-pager" ref={targetRef}>
      <div className="swipe-pager__track" data-testid="track" ref={trackRef} />
    </div>
  );
}

describe("pagerIndexApplyPlan", () => {
  it("lets programmatic navigation supersede an in-flight swipe commit", () => {
    // Old bug: pendingCommit=2 blocked applying index=1 (Add game from settings).
    expect(pagerIndexApplyPlan(1, 2, 2)).toEqual({
      clearPending: true,
      apply: true,
      withTransition: true,
    });
  });

  it("completes a matching swipe commit with transition", () => {
    expect(pagerIndexApplyPlan(2, 2, 1)).toEqual({
      clearPending: true,
      apply: true,
      withTransition: true,
    });
  });
});

describe("useSwipePager settle", () => {
  it("snaps track to the active index when settleKey changes without an index change", () => {
    const { getByTestId, rerender } = render(<PagerHarness index={1} settleKey="catalog" />);
    const track = getByTestId("track");

    act(() => {
      track.style.transform = "translate3d(-45%, 0px, 0px)";
    });
    expect(track.style.transform).toBe("translate3d(-45%, 0px, 0px)");

    rerender(<PagerHarness index={1} settleKey="catalog:/games/new" />);
    expect(track.style.transform).toBe(pagerTrackTranslateFromProgress(1));
  });

  it("clears inline track transform when swipe is disabled (desktop)", () => {
    const { getByTestId, rerender } = render(<PagerHarness index={2} enabled />);
    const track = getByTestId("track");
    expect(track.style.transform).toBe(pagerTrackTranslateFromProgress(2));

    rerender(<PagerHarness index={2} enabled={false} />);
    expect(track.style.transform).toBe("");
  });
});
