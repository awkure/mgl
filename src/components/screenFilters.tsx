import { createContext, useContext, useState, type ReactNode } from "react";
import { emptyCatalogSearchFilters, type CatalogSearchFilters } from "../domain/catalogSearch";

interface TierFiltersValue {
  filters: CatalogSearchFilters;
  setFilters: (next: CatalogSearchFilters) => void;
}

const TierFiltersContext = createContext<TierFiltersValue | null>(null);

export function ScreenFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState(emptyCatalogSearchFilters);
  return <TierFiltersContext.Provider value={{ filters, setFilters }}>{children}</TierFiltersContext.Provider>;
}

export function useTierFilters(): TierFiltersValue {
  const value = useContext(TierFiltersContext);
  if (!value) throw new Error("useTierFilters requires ScreenFiltersProvider");
  return value;
}
