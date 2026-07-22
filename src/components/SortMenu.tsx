import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CATALOG_SORT_KEYS,
  CATALOG_SORT_LABELS,
  type CatalogSortKey,
} from "../domain/catalogSort";
import { placeFilterMenuPanel } from "./filterMenuPosition";
import { Icon } from "./Icon";

export function SortMenu({ value, onChange }: {
  value: CatalogSortKey;
  onChange: (key: CatalogSortKey) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; minWidth: number } | null>(null);

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
  }, [open, value]);

  const panel = open ? createPortal(
    <div
      className="filter-menu__panel"
      data-filter-menu-portal=""
      ref={panelRef}
      role="listbox"
      aria-label="Сортировка"
      style={coords ? { top: coords.top, left: coords.left, minWidth: coords.minWidth } : { visibility: "hidden", top: 0, left: 0 }}
    >
      {CATALOG_SORT_KEYS.map((key) => (
        <label key={key}>
          <input
            checked={value === key}
            name="catalog-sort"
            onChange={() => {
              onChange(key);
              if (detailsRef.current) detailsRef.current.open = false;
              setOpen(false);
            }}
            type="radio"
          />
          <span><Icon name="check" size={14} /></span>
          {CATALOG_SORT_LABELS[key]}
        </label>
      ))}
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
        <summary aria-label={`Сортировка: ${CATALOG_SORT_LABELS[value]}`} ref={summaryRef}>
          <span className="filter-menu__caption">Сортировка</span>
          <b>{CATALOG_SORT_LABELS[value]}</b>
          <Icon name="chevron-down" size={16} />
        </summary>
      </details>
      {panel}
    </>
  );
}
