import { useEffect, useRef, type RefObject } from "react";

const FPS_FLOOR = 30;
const FPS_SAMPLE_MS = 2500;

export interface UseLiquidGlassEffectOptions {
  enabled: boolean;
  rootRef: RefObject<HTMLElement | null>;
  glassRefs: Array<RefObject<HTMLElement | null>>;
}

function prefersReducedEffects(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
}

function hasWebGl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

export function useLiquidGlassEffect({
  enabled,
  rootRef,
  glassRefs,
}: UseLiquidGlassEffectOptions): void {
  const instanceRef = useRef<{ destroy: () => void; fps: number; markChanged: (el?: HTMLElement) => void } | null>(null);
  const glassRefsRef = useRef(glassRefs);
  glassRefsRef.current = glassRefs;

  useEffect(() => {
    if (!enabled) return;
    if (prefersReducedEffects() || !hasWebGl()) return;

    const root = rootRef.current;
    if (!root) return;

    let cancelled = false;
    let fpsTimer = 0;
    let scrollTimer = 0;
    let cleanupScroll: (() => void) | undefined;

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

        fpsTimer = window.setTimeout(() => {
          if (cancelled || !instanceRef.current) return;
          if (instance.fps > 0 && instance.fps < FPS_FLOOR) {
            instance.destroy();
            instanceRef.current = null;
            delete document.documentElement.dataset.glassEffect;
          }
        }, FPS_SAMPLE_MS);

        const onScroll = () => {
          if (scrollTimer) return;
          scrollTimer = window.setTimeout(() => {
            scrollTimer = 0;
            instanceRef.current?.markChanged();
          }, 120);
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
      if (fpsTimer) window.clearTimeout(fpsTimer);
      if (scrollTimer) window.clearTimeout(scrollTimer);
      cleanupScroll?.();
      instanceRef.current?.destroy();
      instanceRef.current = null;
      delete document.documentElement.dataset.glassEffect;
    };
  }, [enabled, rootRef]);
}
