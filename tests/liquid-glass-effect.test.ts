import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FPS_BAD_STREAK,
  FPS_FLOOR,
  nextBadFpsStreak,
  shouldDisableGlass,
} from "../src/hooks/useLiquidGlassEffect";

describe("liquid glass effect guards", () => {
  it("disables on warm-up sample below FPS floor", () => {
    expect(shouldDisableGlass(0, "warmup")).toBe(false);
    expect(shouldDisableGlass(FPS_FLOOR, "warmup")).toBe(false);
    expect(shouldDisableGlass(FPS_FLOOR - 1, "warmup")).toBe(true);
  });

  it("disables while watching only after a sustained bad streak", () => {
    expect(shouldDisableGlass(20, "watch", FPS_BAD_STREAK - 1)).toBe(false);
    expect(shouldDisableGlass(20, "watch", FPS_BAD_STREAK)).toBe(true);
    expect(shouldDisableGlass(60, "watch", FPS_BAD_STREAK)).toBe(false);
  });

  it("tracks bad FPS streak and resets on recovery", () => {
    expect(nextBadFpsStreak(20, 0)).toBe(1);
    expect(nextBadFpsStreak(20, 1)).toBe(2);
    expect(nextBadFpsStreak(60, 2)).toBe(0);
    expect(nextBadFpsStreak(0, 2)).toBe(2);
  });

  it("does not mark app main as data-dynamic (forces per-frame html-to-image)", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/AppShell.tsx"), "utf8");
    expect(source).not.toMatch(/data-dynamic/);
    expect(source).toContain("contentRef: mainRef");
  });
});
