import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { isHorizontalGesture, PTR_ARM_PX } from "./usePullToRefresh";

export const SWIPE_ARM_PX = PTR_ARM_PX;
export const SWIPE_THRESHOLD_PX = 70;
export const SWIPE_EDGE_GUARD_PX = 24;
export const SWIPE_COMMIT_RATIO = 0.25;
export const SWIPE_VELOCITY_PX_PER_MS = 0.45;
export const PAGER_PANEL_COUNT = 3;
export const PAGER_TRANSITION = "transform 280ms cubic-bezier(.22, 1, .36, 1)";

export type SwipeDirection = "left" | "right";
export type PagerIndex = 0 | 1 | 2;
export type PagerPath = "/" | "/games" | "/settings";

export function isNearScreenEdge(clientX: number, width: number, guardPx = SWIPE_EDGE_GUARD_PX): boolean {
  return clientX <= guardPx || clientX >= width - guardPx;
}

export function shouldArmSwipe(dx: number, dy: number, armPx = SWIPE_ARM_PX): boolean {
  return isHorizontalGesture(dx, dy, armPx);
}

export function swipeDirection(dx: number, threshold = SWIPE_THRESHOLD_PX): SwipeDirection | null {
  if (dx <= -threshold) return "left";
  if (dx >= threshold) return "right";
  return null;
}

export function routeToPagerIndex(pathname: string): PagerIndex {
  if (pathname === "/settings") return 2;
  if (pathname === "/games") return 1;
  return 0;
}

export function pagerIndexToPath(index: PagerIndex): PagerPath {
  if (index === 2) return "/settings";
  if (index === 1) return "/games";
  return "/";
}

export function clampPagerDrag(dx: number, index: PagerIndex, width: number, lastIndex = PAGER_PANEL_COUNT - 1): number {
  if (width <= 0) return 0;
  if (index === 0 && dx > 0) return dx * 0.25;
  if (index === lastIndex && dx < 0) return dx * 0.25;
  return dx;
}

export function shouldCommitPagerSwipe(
  dx: number,
  width: number,
  velocityPxPerMs: number,
  commitRatio = SWIPE_COMMIT_RATIO,
  velocityThreshold = SWIPE_VELOCITY_PX_PER_MS,
): SwipeDirection | null {
  if (width <= 0) return null;
  if (Math.abs(velocityPxPerMs) >= velocityThreshold) {
    return velocityPxPerMs < 0 ? "left" : "right";
  }
  if (Math.abs(dx) >= width * commitRatio) {
    return dx < 0 ? "left" : "right";
  }
  return null;
}

export function nextPagerIndex(
  index: PagerIndex,
  direction: SwipeDirection,
  lastIndex = PAGER_PANEL_COUNT - 1,
): PagerIndex | null {
  if (direction === "left" && index < lastIndex) return (index + 1) as PagerIndex;
  if (direction === "right" && index > 0) return (index - 1) as PagerIndex;
  return null;
}

/** Fractional pager progress: 0 = first panel, 1 = second, … Drag left (negative dx) increases progress. */
export function pagerProgress(index: PagerIndex, dragOffsetPx: number, pagerWidthPx: number): number {
  if (pagerWidthPx <= 0) return index;
  return index - dragOffsetPx / pagerWidthPx;
}

/** Track is N× pager width; each panel is (100/N)% of the track. % transforms are relative to the track. */
export function pagerTrackTranslateFromProgress(progress: number, panelCount = PAGER_PANEL_COUNT): string {
  const step = 100 / panelCount;
  return `translate3d(${-progress * step}%, 0, 0)`;
}

export function pagerTrackTranslate(
  index: PagerIndex,
  dragOffsetPx: number,
  pagerWidthPx: number,
  panelCount = PAGER_PANEL_COUNT,
): string {
  return pagerTrackTranslateFromProgress(pagerProgress(index, dragOffsetPx, pagerWidthPx), panelCount);
}

export interface UseSwipePagerOptions {
  targetRef: RefObject<HTMLElement | null>;
  trackRef: RefObject<HTMLElement | null>;
  index: PagerIndex;
  enabled?: boolean;
  isBlocked?: () => boolean;
  onCommit: (next: PagerIndex) => void;
  onProgress?: (progress: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
}

export interface UseSwipePagerResult {
  dragging: boolean;
}

export function useSwipePager({
  targetRef,
  trackRef,
  index,
  enabled = true,
  isBlocked,
  onCommit,
  onProgress,
  onDraggingChange,
}: UseSwipePagerOptions): UseSwipePagerResult {
  const [dragging, setDragging] = useState(false);
  const onCommitRef = useRef(onCommit);
  const onProgressRef = useRef(onProgress);
  const onDraggingChangeRef = useRef(onDraggingChange);
  const isBlockedRef = useRef(isBlocked);
  const indexRef = useRef(index);
  const dragOffsetRef = useRef(0);
  const widthRef = useRef(0);
  const pendingCommitRef = useRef<PagerIndex | null>(null);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    onDraggingChangeRef.current = onDraggingChange;
  }, [onDraggingChange]);

  useEffect(() => {
    isBlockedRef.current = isBlocked;
  }, [isBlocked]);

  const applyVisual = (progress: number, withTransition: boolean) => {
    const track = trackRef.current;
    if (track) {
      track.style.transition = withTransition ? PAGER_TRANSITION : "none";
      track.style.transform = pagerTrackTranslateFromProgress(progress);
    }
    onProgressRef.current?.(progress);
  };

  const setDraggingState = (next: boolean) => {
    setDragging(next);
    onDraggingChangeRef.current?.(next);
  };

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    const measure = () => {
      widthRef.current = target.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 0);
    };
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      measure();
      if (pendingCommitRef.current === null && dragOffsetRef.current === 0) {
        applyVisual(indexRef.current, false);
      }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetRef, trackRef]);

  useLayoutEffect(() => {
    const previous = indexRef.current;
    indexRef.current = index;

    if (pendingCommitRef.current === index) {
      pendingCommitRef.current = null;
      dragOffsetRef.current = 0;
      applyVisual(index, true);
      return;
    }

    if (pendingCommitRef.current !== null) {
      return;
    }

    if (previous !== index) {
      dragOffsetRef.current = 0;
      applyVisual(index, true);
      return;
    }

    dragOffsetRef.current = 0;
    applyVisual(index, false);
  }, [index]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || !enabled) return;

    let phase: "idle" | "tracking" | "swiping" = "idle";
    let startX = 0;
    let startY = 0;
    let lastDx = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let raf = 0;
    let pendingDx = 0;

    const flush = () => {
      raf = 0;
      const width = widthRef.current || target.clientWidth || window.innerWidth;
      const clamped = clampPagerDrag(pendingDx, indexRef.current, width);
      dragOffsetRef.current = clamped;
      applyVisual(pagerProgress(indexRef.current, clamped, width), false);
    };

    const schedule = (dx: number) => {
      pendingDx = dx;
      if (!raf) raf = requestAnimationFrame(flush);
    };

    const resetTracking = () => {
      phase = "idle";
      lastDx = 0;
      velocity = 0;
      pendingDx = 0;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const settleToIndex = (targetIndex: PagerIndex, withTransition: boolean) => {
      dragOffsetRef.current = 0;
      applyVisual(targetIndex, withTransition);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      if (isBlockedRef.current?.()) return;
      if (pendingCommitRef.current !== null) return;
      const touch = event.touches[0];
      if (isNearScreenEdge(touch.clientX, window.innerWidth)) return;
      widthRef.current = target.clientWidth || window.innerWidth;
      startX = touch.clientX;
      startY = touch.clientY;
      lastX = touch.clientX;
      lastT = performance.now();
      lastDx = 0;
      velocity = 0;
      phase = "tracking";
    };

    const onTouchMove = (event: TouchEvent) => {
      if (phase !== "tracking" && phase !== "swiping") return;
      if (event.touches.length !== 1) {
        resetTracking();
        setDraggingState(false);
        settleToIndex(indexRef.current, true);
        return;
      }
      if (isBlockedRef.current?.()) {
        resetTracking();
        setDraggingState(false);
        settleToIndex(indexRef.current, true);
        return;
      }

      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      velocity = (touch.clientX - lastX) / dt;
      lastX = touch.clientX;
      lastT = now;
      lastDx = dx;

      if (phase === "tracking") {
        if (Math.abs(dy) > SWIPE_ARM_PX && Math.abs(dy) > Math.abs(dx)) {
          resetTracking();
          return;
        }
        if (!shouldArmSwipe(dx, dy)) return;
        phase = "swiping";
        setDraggingState(true);
      }

      if (phase === "swiping") {
        if (event.cancelable) event.preventDefault();
        schedule(dx);
      }
    };

    const onTouchEnd = () => {
      if (phase === "swiping") {
        const width = widthRef.current || target.clientWidth || window.innerWidth;
        const direction = shouldCommitPagerSwipe(lastDx, width, velocity);
        const next = direction ? nextPagerIndex(indexRef.current, direction) : null;
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        phase = "idle";
        setDraggingState(false);
        if (next !== null) {
          pendingCommitRef.current = next;
          applyVisual(pagerProgress(indexRef.current, dragOffsetRef.current, width), true);
          onCommitRef.current(next);
        } else {
          settleToIndex(indexRef.current, true);
        }
        lastDx = 0;
        velocity = 0;
        return;
      }
      resetTracking();
    };

    target.addEventListener("touchstart", onTouchStart, { passive: true });
    target.addEventListener("touchmove", onTouchMove, { passive: false });
    target.addEventListener("touchend", onTouchEnd);
    target.addEventListener("touchcancel", onTouchEnd);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      target.removeEventListener("touchstart", onTouchStart);
      target.removeEventListener("touchmove", onTouchMove);
      target.removeEventListener("touchend", onTouchEnd);
      target.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, targetRef, trackRef]);

  return { dragging };
}
