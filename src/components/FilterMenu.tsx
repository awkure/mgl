import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

export function FilterMenu({ label, values, selected, renderLabel = (value) => value, onChange }: {
  label: string;
  values: string[];
  selected: string[];
  renderLabel?: (value: string) => string;
  onChange: (values: string[]) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);

  useEffect(() => {
    const closeWhenOutside = (event: Event) => {
      const details = detailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) details.open = false;
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("focusin", closeWhenOutside);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("focusin", closeWhenOutside);
    };
  }, []);

  return (
    <details className="filter-menu" ref={detailsRef}>
      <summary>{label}{selected.length ? <b>{selected.length}</b> : null}<Icon name="chevron-down" size={16} /></summary>
      <div className="filter-menu__panel">
        {values.length
          ? values.map((value) => (
            <label key={value}>
              <input checked={selected.includes(value)} onChange={() => toggle(value)} type="checkbox" />
              <span><Icon name="check" size={14} /></span>
              {renderLabel(value)}
            </label>
          ))
          : <p>Пока нет вариантов</p>}
      </div>
    </details>
  );
}
