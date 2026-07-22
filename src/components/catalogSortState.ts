import { useEffect, useState } from "react";
import {
  CATALOG_SORT_EVENT,
  CATALOG_SORT_STORAGE_KEY,
  loadCatalogSort,
  saveCatalogSort,
  type CatalogSort,
} from "../domain/catalogSort";

function readSort(): CatalogSort {
  if (typeof window === "undefined") {
    return loadCatalogSort({ getItem: () => null });
  }
  return loadCatalogSort(window.localStorage);
}

function writeSort(sort: CatalogSort): void {
  if (typeof window === "undefined") return;
  saveCatalogSort(window.localStorage, sort);
  window.dispatchEvent(new Event(CATALOG_SORT_EVENT));
}

/** Shared catalog sort: localStorage + event sync between filter bar and CatalogPage. */
export function useCatalogSort(): [CatalogSort, (next: CatalogSort) => void] {
  const [sort, setSortState] = useState<CatalogSort>(readSort);

  useEffect(() => {
    const sync = () => {
      const next = readSort();
      setSortState((current) => (current.key === next.key && current.dir === next.dir ? current : next));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === CATALOG_SORT_STORAGE_KEY) sync();
    };
    window.addEventListener(CATALOG_SORT_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CATALOG_SORT_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setSort = (next: CatalogSort) => {
    setSortState(next);
    writeSort(next);
  };

  return [sort, setSort];
}
