import { useRef, type CSSProperties, type ReactNode, type Ref } from "react";
import { usePullToRefresh, type UsePullToRefreshOptions } from "../hooks/usePullToRefresh";

export interface PullToRefreshProps {
  children: ReactNode;
  className?: string;
  /** When set, this element is both the gesture target and the scroll root (tier board). */
  scrollSelf?: boolean;
  /** Receives the pull-to-refresh root element (catalog scroll root when scrollSelf). */
  scrollRootRef?: Ref<HTMLDivElement | null>;
  enabled?: boolean;
  onRefresh?: UsePullToRefreshOptions["onRefresh"];
}

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else ref.current = value;
}

export function PullToRefresh({
  children,
  className,
  scrollSelf = false,
  scrollRootRef,
  enabled = true,
  onRefresh,
}: PullToRefreshProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const setRootRef = (node: HTMLDivElement | null) => {
    rootRef.current = node;
    assignRef(scrollRootRef, node);
  };
  const { offset, phase, progress, stretch } = usePullToRefresh({
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
  const springing = phase === "idle" || phase === "refreshing";
  const contentStyle: CSSProperties = {
    transform: offset || stretch !== 1
      ? `translateY(${offset}px) scaleY(${stretch})`
      : undefined,
    transition: phase === "pulling" || phase === "tracking"
      ? undefined
      : "transform 320ms cubic-bezier(.22, 1, .36, 1), opacity 200ms ease",
    opacity: phase === "refreshing" ? 0.92 : undefined,
  };

  return (
    <div
      aria-busy={phase === "refreshing" || undefined}
      className={rootClass}
      data-phase={phase}
      data-springing={springing || undefined}
      ref={setRootRef}
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
