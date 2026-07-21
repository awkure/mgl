import { useEffect, useRef, type RefObject } from "react";

export const FPS_FLOOR = 30;
export const FPS_SAMPLE_MS = 2500;
export const FPS_WATCH_MS = 1000;
export const FPS_BAD_STREAK = 2;
export const SCROLL_MARK_MS = 160;

export interface UseLiquidGlassEffectOptions {
  enabled: boolean;
  rootRef: RefObject<HTMLElement | null>;
  /** Scrolling content behind the glass — mark this on scroll, never data-dynamic. */
  contentRef?: RefObject<HTMLElement | null>;
  glassRefs: Array<RefObject<HTMLElement | null>>;
}

export function prefersReducedEffects(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
}

export function hasWebGl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

/** Tear down on warm-up sample below floor, or after sustained low FPS while watching. */
export function shouldDisableGlass(
  fps: number,
  mode: "warmup" | "watch",
  badStreak = 0,
): boolean {
  if (fps <= 0 || fps >= FPS_FLOOR) return false;
  if (mode === "warmup") return true;
  return badStreak >= FPS_BAD_STREAK;
}

export function nextBadFpsStreak(fps: number, previous: number): number {
  if (fps <= 0) return previous;
  return fps < FPS_FLOOR ? previous + 1 : 0;
}

export function useLiquidGlassEffect({
  enabled,
  rootRef,
  contentRef,
  glassRefs,
}: UseLiquidGlassEffectOptions): void {
  const instanceRef = useRef<{ destroy: () => void; fps: number; markChanged: (el?: HTMLElement) => void } | null>(null);
  const glassRefsRef = useRef(glassRefs);
  const contentRefInternal = useRef(contentRef);
  glassRefsRef.current = glassRefs;
  contentRefInternal.current = contentRef;

  useEffect(() => {
    if (!enabled) return;
    if (prefersReducedEffects() || !hasWebGl()) return;

    const root = rootRef.current;
    if (!root) return;

    let cancelled = false;
    let warmUpTimer = 0;
    let watchTimer = 0;
    let scrollTimer = 0;
    let badStreak = 0;
    let cleanupScroll: (() => void) | undefined;

    const teardown = () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
      delete document.documentElement.dataset.glassEffect;
      if (watchTimer) {
        window.clearInterval(watchTimer);
        watchTimer = 0;
      }
    };

    const start = async () => {
      const glassElements = glassRefsRef.current
        .map((ref) => ref.current)
        .filter((el): el is HTMLElement => Boolean(el));
      if (!glassElements.length) return;

      try {
        const { LiquidGlass } = await import("@ybouane/liquidglass");
        if (cancelled) return;
        const instance = await LiquidGlass.init({
          root,
          glassElements,
          defaults: {
            blurAmount: 0.28,
            refraction: 0.55,
            chromAberration: 0.04,
            edgeHighlight: 0.08,
            fresnel: 0.85,
            cornerRadius: 28,
            shadowOpacity: 0.28,
            shadowSpread: 12,
            floating: false,
          },
        });
        if (cancelled) {
          instance.destroy();
          return;
        }
        instanceRef.current = instance;
        document.documentElement.dataset.glassEffect = "webgl";

        warmUpTimer = window.setTimeout(() => {
          if (cancelled || !instanceRef.current) return;
          if (shouldDisableGlass(instanceRef.current.fps, "warmup")) {
            teardown();
            return;
          }
          watchTimer = window.setInterval(() => {
            if (cancelled || !instanceRef.current) return;
            badStreak = nextBadFpsStreak(instanceRef.current.fps, badStreak);
            if (shouldDisableGlass(instanceRef.current.fps, "watch", badStreak)) {
              teardown();
            }
          }, FPS_WATCH_MS);
        }, FPS_SAMPLE_MS);

        const onScroll = () => {
          if (scrollTimer || !instanceRef.current) return;
          scrollTimer = window.setTimeout(() => {
            scrollTimer = 0;
            const content = contentRefInternal.current?.current ?? undefined;
            instanceRef.current?.markChanged(content);
          }, SCROLL_MARK_MS);
        };
        root.addEventListener("scroll", onScroll, true);
        cleanupScroll = () => root.removeEventListener("scroll", onScroll, true);
      } catch {
        delete document.documentElement.dataset.glassEffect;
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (warmUpTimer) window.clearTimeout(warmUpTimer);
      if (watchTimer) window.clearInterval(watchTimer);
      if (scrollTimer) window.clearTimeout(scrollTimer);
      cleanupScroll?.();
      teardown();
    };
  }, [enabled, rootRef, contentRef]);
}
