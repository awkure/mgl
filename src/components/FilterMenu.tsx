import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeFilterMenuPanel } from "./filterMenuPosition";
import { Icon } from "./Icon";

export function FilterMenu({ label, values, selected, renderLabel = (value) => value, onChange }: {
  label: string;
  values: string[];
  selected: string[];
  renderLabel?: (value: string) => string;
  onChange: (values: string[]) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);

  const syncPosition = () => {
    const summary = summaryRef.current;
    const panel = panelRef.current;
    if (!summary || !panel) return;
    const next = placeFilterMenuPanel(
      summary.getBoundingClientRect(),
      { width: panel.offsetWidth, height: panel.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    setCoords(next);
  };

  useEffect(() => {
    const closeWhenOutside = (event: Event) => {
      const details = detailsRef.current;
      const target = event.target;
      if (!(target instanceof Node) || !details?.open) return;
      if (details.contains(target) || panelRef.current?.contains(target)) return;
      details.open = false;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("focusin", closeWhenOutside);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("focusin", closeWhenOutside);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    syncPosition();
    const onReposition = () => syncPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, values.length, selected.length]);

  const panel = open ? createPortal(
    <div
      className="filter-menu__panel"
      data-filter-menu-portal=""
      ref={panelRef}
      style={coords ? { top: coords.top, left: coords.left, minWidth: coords.minWidth } : { visibility: "hidden", top: 0, left: 0 }}
    >
      {values.length
        ? values.map((value) => (
          <label key={value}>
            <input checked={selected.includes(value)} onChange={() => toggle(value)} type="checkbox" />
            <span><Icon name="check" size={14} /></span>
            {renderLabel(value)}
          </label>
        ))
        : <p>Пока нет вариантов</p>}
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <details
        className="filter-menu"
        onToggle={(event) => setOpen(event.currentTarget.open)}
        ref={detailsRef}
      >
        <summary ref={summaryRef}>{label}{selected.length ? <b>{selected.length}</b> : null}<Icon name="chevron-down" size={16} /></summary>
      </details>
      {panel}
    </>
  );
}
