import { useRef, type CSSProperties, type ReactNode } from "react";
import { usePullToRefresh, type UsePullToRefreshOptions } from "../hooks/usePullToRefresh";

export interface PullToRefreshProps {
  children: ReactNode;
  className?: string;
  /** When set, this element is both the gesture target and the scroll root (tier board). */
  scrollSelf?: boolean;
  enabled?: boolean;
  onRefresh?: UsePullToRefreshOptions["onRefresh"];
}

export function PullToRefresh({
  children,
  className,
  scrollSelf = false,
  enabled = true,
  onRefresh,
}: PullToRefreshProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { offset, phase, progress } = usePullToRefresh({
    targetRef: rootRef,
    scrollRef: scrollSelf ? rootRef : undefined,
    enabled,
    onRefresh,
  });

  const spinning = phase === "refreshing" || progress >= 1;
  const rootClass = ["pull-to-refresh", className].filter(Boolean).join(" ");
  const style = {
    "--ptr-offset": `${offset}px`,
  } as CSSProperties;
  const contentStyle: CSSProperties = {
    transform: offset ? `translateY(${offset}px)` : undefined,
    transition: phase === "pulling" || phase === "tracking" || phase === "refreshing"
      ? undefined
      : "transform 180ms ease-out",
  };

  return (
    <div
      aria-busy={phase === "refreshing" || undefined}
      className={rootClass}
      data-phase={phase}
      ref={rootRef}
      style={style}
    >
      <div
        aria-hidden="true"
        className="pull-to-refresh__indicator"
        style={{ opacity: phase === "idle" ? 0 : Math.max(progress, phase === "refreshing" ? 1 : 0.35) }}
      >
        <span className={`pull-to-refresh__spinner${spinning ? " is-spinning" : ""}`} />
      </div>
      <div className="pull-to-refresh__content" style={contentStyle}>
        {children}
      </div>
    </div>
  );
}
