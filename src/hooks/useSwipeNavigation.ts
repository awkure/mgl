import { useEffect, useRef, type RefObject } from "react";
import { isHorizontalGesture, PTR_ARM_PX } from "./usePullToRefresh";

export const SWIPE_ARM_PX = PTR_ARM_PX;
export const SWIPE_THRESHOLD_PX = 70;
export const SWIPE_EDGE_GUARD_PX = 24;

export type SwipeDirection = "left" | "right";

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

export interface UseSwipeNavigationOptions {
  targetRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  /** Return true while another gesture (e.g. dnd-kit drag) owns the pointer. */
  isBlocked?: () => boolean;
  onSwipe: (direction: SwipeDirection) => void;
}

export function useSwipeNavigation({
  targetRef,
  enabled = true,
  isBlocked,
  onSwipe,
}: UseSwipeNavigationOptions): void {
  const onSwipeRef = useRef(onSwipe);
  const isBlockedRef = useRef(isBlocked);

  useEffect(() => {
    onSwipeRef.current = onSwipe;
  }, [onSwipe]);

  useEffect(() => {
    isBlockedRef.current = isBlocked;
  }, [isBlocked]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || !enabled) return;

    let phase: "idle" | "tracking" | "swiping" = "idle";
    let startX = 0;
    let startY = 0;
    let lastDx = 0;

    const reset = () => {
      phase = "idle";
      lastDx = 0;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      if (isBlockedRef.current?.()) return;
      const touch = event.touches[0];
      if (isNearScreenEdge(touch.clientX, window.innerWidth)) return;
      startX = touch.clientX;
      startY = touch.clientY;
      lastDx = 0;
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

      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      lastDx = dx;

      if (phase === "tracking") {
        if (Math.abs(dy) > SWIPE_ARM_PX && Math.abs(dy) > Math.abs(dx)) {
          reset();
          return;
        }
        if (!shouldArmSwipe(dx, dy)) return;
        phase = "swiping";
      }

      if (phase === "swiping" && event.cancelable) {
        event.preventDefault();
      }
    };

    const onTouchEnd = () => {
      if (phase === "swiping") {
        const direction = swipeDirection(lastDx);
        reset();
        if (direction) onSwipeRef.current(direction);
        return;
      }
      reset();
    };

    target.addEventListener("touchstart", onTouchStart, { passive: true });
    target.addEventListener("touchmove", onTouchMove, { passive: false });
    target.addEventListener("touchend", onTouchEnd);
    target.addEventListener("touchcancel", onTouchEnd);

    return () => {
      target.removeEventListener("touchstart", onTouchStart);
      target.removeEventListener("touchmove", onTouchMove);
      target.removeEventListener("touchend", onTouchEnd);
      target.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, targetRef]);
}
