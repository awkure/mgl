import { useEffect, useRef, useState, type RefObject } from "react";
import { isHorizontalGesture, PTR_ARM_PX } from "./usePullToRefresh";

export const SWIPE_ARM_PX = PTR_ARM_PX;
export const SWIPE_THRESHOLD_PX = 70;
export const SWIPE_EDGE_GUARD_PX = 24;
export const SWIPE_COMMIT_RATIO = 0.25;
export const SWIPE_VELOCITY_PX_PER_MS = 0.45;

export type SwipeDirection = "left" | "right";
export type PagerIndex = 0 | 1;

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
  return pathname === "/games" ? 1 : 0;
}

export function pagerIndexToPath(index: PagerIndex): "/" | "/games" {
  return index === 1 ? "/games" : "/";
}

export function clampPagerDrag(dx: number, index: PagerIndex, width: number): number {
  if (width <= 0) return 0;
  if (index === 0 && dx > 0) return dx * 0.25;
  if (index === 1 && dx < 0) return dx * 0.25;
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

export function nextPagerIndex(index: PagerIndex, direction: SwipeDirection): PagerIndex | null {
  if (direction === "left" && index === 0) return 1;
  if (direction === "right" && index === 1) return 0;
  return null;
}

/** Track is 200% wide; each panel is 50% of the track. % transforms are relative to the track. */
export function pagerTrackTranslate(index: PagerIndex, dragOffsetPx: number, pagerWidthPx: number): string {
  const basePercent = -index * 50;
  const dragPercent = pagerWidthPx > 0 ? (dragOffsetPx / pagerWidthPx) * 50 : 0;
  return `translate3d(calc(${basePercent}% + ${dragPercent}%), 0, 0)`;
}

export interface UseSwipePagerOptions {
  targetRef: RefObject<HTMLElement | null>;
  index: PagerIndex;
  enabled?: boolean;
  isBlocked?: () => boolean;
  onCommit: (next: PagerIndex) => void;
}

export interface UseSwipePagerResult {
  dragOffset: number;
  dragging: boolean;
}

export function useSwipePager({
  targetRef,
  index,
  enabled = true,
  isBlocked,
  onCommit,
}: UseSwipePagerOptions): UseSwipePagerResult {
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const onCommitRef = useRef(onCommit);
  const isBlockedRef = useRef(isBlocked);
  const indexRef = useRef(index);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    isBlockedRef.current = isBlocked;
  }, [isBlocked]);

  useEffect(() => {
    indexRef.current = index;
    setDragOffset(0);
    setDragging(false);
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
      setDragOffset(pendingDx);
    };

    const schedule = (dx: number) => {
      pendingDx = dx;
      if (!raf) raf = requestAnimationFrame(flush);
    };

    const reset = () => {
      phase = "idle";
      lastDx = 0;
      velocity = 0;
      pendingDx = 0;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      setDragging(false);
      setDragOffset(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      if (isBlockedRef.current?.()) return;
      const touch = event.touches[0];
      if (isNearScreenEdge(touch.clientX, window.innerWidth)) return;
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
        reset();
        return;
      }
      if (isBlockedRef.current?.()) {
        reset();
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
          reset();
          return;
        }
        if (!shouldArmSwipe(dx, dy)) return;
        phase = "swiping";
        setDragging(true);
      }

      if (phase === "swiping") {
        if (event.cancelable) event.preventDefault();
        const width = target.clientWidth || window.innerWidth;
        schedule(clampPagerDrag(dx, indexRef.current, width));
      }
    };

    const onTouchEnd = () => {
      if (phase === "swiping") {
        const width = target.clientWidth || window.innerWidth;
        const direction = shouldCommitPagerSwipe(lastDx, width, velocity);
        const next = direction ? nextPagerIndex(indexRef.current, direction) : null;
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        phase = "idle";
        setDragging(false);
        if (next !== null) {
          setDragOffset(0);
          onCommitRef.current(next);
        } else {
          setDragOffset(0);
        }
        lastDx = 0;
        velocity = 0;
        return;
      }
      reset();
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
  }, [enabled, targetRef]);

  return { dragOffset, dragging };
}
