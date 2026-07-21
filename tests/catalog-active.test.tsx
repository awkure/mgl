import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { CatalogPage } from "../src/pages/CatalogPage";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CatalogPage active gating", () => {
  it("does not rewrite the hash while inactive in the pager", () => {
    const replaceState = vi.spyOn(history, "replaceState");
    render(<CatalogPage active={false} assets={{}} games={[]} />);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("rewrites the catalog hash when active", () => {
    const replaceState = vi.spyOn(history, "replaceState");
    render(<CatalogPage active assets={{}} games={[]} />);
    expect(replaceState).toHaveBeenCalled();
    const url = String(replaceState.mock.calls.at(-1)?.[2] ?? "");
    expect(url.startsWith("#/games")).toBe(true);
  });
});
