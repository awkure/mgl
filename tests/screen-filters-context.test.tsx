import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScreenFiltersProvider, useTierFilters } from "../src/components/screenFilters";
import { emptyCatalogSearchFilters } from "../src/domain/catalogSearch";

describe("useTierFilters", () => {
  it("holds independent session filter state", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ScreenFiltersProvider>{children}</ScreenFiltersProvider>
    );
    const { result } = renderHook(() => useTierFilters(), { wrapper });
    expect(result.current.filters).toEqual(emptyCatalogSearchFilters());
    act(() => {
      result.current.setFilters({ ...emptyCatalogSearchFilters(), q: "zelda", statuses: ["playing"] });
    });
    expect(result.current.filters.q).toBe("zelda");
    expect(result.current.filters.statuses).toEqual(["playing"]);
  });
});
