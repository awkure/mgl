import { useEffect, useRef, useState, type RefObject } from "react";

export const PTR_ARM_PX = 8;
export const PTR_THRESHOLD_PX = 60;
export const PTR_MAX_OFFSET_PX = 100;
export const PTR_SCROLL_TOP_EPSILON = 1;
/** Max vertical scale applied at full pull (transform-origin: top). */
export const PTR_MAX_STRETCH = 0.045;

export type PullPhase = "idle" | "tracking" | "pulling" | "refreshing";

export function isAtScrollTop(scrollTop: number, epsilon = PTR_SCROLL_TOP_EPSILON): boolean {
  return scrollTop <= epsilon;
}

export function shouldArmPull(dx: number, dy: number, armPx = PTR_ARM_PX): boolean {
  return dy > armPx && dy > Math.abs(dx);
}

export function isHorizontalGesture(dx: number, dy: number, armPx = PTR_ARM_PX): boolean {
  return Math.abs(dx) > armPx && Math.abs(dx) >= dy;
}

/** Rubber-band map: √ resistance, capped. ~144px finger → threshold. */
export function dampPull(dy: number, max = PTR_MAX_OFFSET_PX): number {
  if (dy <= 0) return 0;
  return Math.min(max, Math.sqrt(dy) * 5);
}

export function contentStretch(offset: number, max = PTR_MAX_OFFSET_PX, amount = PTR_MAX_STRETCH): number {
  if (max <= 0 || offset <= 0) return 1;
  return 1 + (Math.min(offset, max) / max) * amount;
}

export function shouldRefresh(offset: number, threshold = PTR_THRESHOLD_PX): boolean {
  return offset >= threshold;
}

export function pullProgress(offset: number, threshold = PTR_THRESHOLD_PX): number {
  if (threshold <= 0) return 0;
  return Math.min(1, Math.max(0, offset / threshold));
}

export interface UsePullToRefreshOptions {
  /** Element that receives touch listeners. */
  targetRef: RefObject<HTMLElement | null>;
  /** Scroll root; omit / null → window (`scrollY`). */
  scrollRef?: RefObject<HTMLElement | null>;
  enabled?: boolean;
  /** Soft refresh preferred; may return a Promise. Default: hard reload. */
  onRefresh?: () => void | Promise<void>;
}

export interface UsePullToRefreshResult {
  offset: number;
  phase: PullPhase;
  progress: number;
  stretch: number;
}

export function usePullToRefresh({
  targetRef,
  scrollRef,
  enabled = true,
  onRefresh,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const [offset, setOffset] = useState(0);
  const [phase, setPhase] = useState<PullPhase>("idle");
  const phaseRef = useRef<PullPhase>("idle");
  const offsetRef = useRef(0);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || !enabled) return;

    const readScrollTop = () => {
      const scrollEl = scrollRef?.current;
      if (scrollEl) return scrollEl.scrollTop;
      return window.scrollY;
    };

    const setPhaseBoth = (next: PullPhase) => {
      phaseRef.current = next;
      setPhase(next);
    };

    const setOffsetBoth = (next: number) => {
      offsetRef.current = next;
      setOffset(next);
    };

    const reset = (animate = false) => {
      setPhaseBoth("idle");
      if (animate && offsetRef.current > 0) {
        requestAnimationFrame(() => setOffsetBoth(0));
        return;
      }
      setOffsetBoth(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (phaseRef.current === "refreshing") return;
      if (event.touches.length !== 1) return;
      if (!isAtScrollTop(readScrollTop())) return;
      startXRef.current = event.touches[0].clientX;
      startYRef.current = event.touches[0].clientY;
      setPhaseBoth("tracking");
      setOffsetBoth(0);
    };

    const onTouchMove = (event: TouchEvent) => {
      const current = phaseRef.current;
      if (current !== "tracking" && current !== "pulling") return;

      if (event.touches.length !== 1) {
        reset();
        return;
      }

      const dx = event.touches[0].clientX - startXRef.current;
      const dy = event.touches[0].clientY - startYRef.current;

      if (current === "tracking") {
        if (!isAtScrollTop(readScrollTop())) {
          reset();
          return;
        }
        if (dy < 0) {
          reset();
          return;
        }
        if (isHorizontalGesture(dx, dy)) {
          reset();
          return;
        }
        if (!shouldArmPull(dx, dy)) return;
        setPhaseBoth("pulling");
      }

      if (phaseRef.current === "pulling") {
        if (event.cancelable) event.preventDefault();
        setOffsetBoth(dampPull(dy));
      }
    };

    const finish = () => {
      const current = phaseRef.current;
      if (current === "pulling") {
        if (shouldRefresh(offsetRef.current)) {
          setPhaseBoth("refreshing");
          setOffsetBoth(Math.max(offsetRef.current, PTR_THRESHOLD_PX));
          const refresh = onRefreshRef.current ?? (() => {
            window.location.reload();
          });
          void Promise.resolve()
            .then(() => refresh())
            .catch(() => undefined)
            .finally(() => {
              if (phaseRef.current === "refreshing") reset(true);
            });
          return;
        }
        reset(true);
        return;
      }
      if (current === "tracking") reset();
    };

    target.addEventListener("touchstart", onTouchStart, { passive: true });
    target.addEventListener("touchmove", onTouchMove, { passive: false });
    target.addEventListener("touchend", finish);
    target.addEventListener("touchcancel", finish);

    return () => {
      target.removeEventListener("touchstart", onTouchStart);
      target.removeEventListener("touchmove", onTouchMove);
      target.removeEventListener("touchend", finish);
      target.removeEventListener("touchcancel", finish);
    };
  }, [enabled, scrollRef, targetRef]);

  return {
    offset,
    phase,
    progress: pullProgress(offset),
    stretch: contentStretch(offset),
  };
}
