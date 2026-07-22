import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_RANDOM_GAME_STATUSES,
  RANDOM_GAME_STATUSES_STORAGE_KEY,
  loadRandomGameStatuses,
  normalizeRandomGameStatuses,
  saveRandomGameStatuses,
} from "../src/state/randomGamePrefs";

beforeEach(() => {
  localStorage.removeItem(RANDOM_GAME_STATUSES_STORAGE_KEY);
});

afterEach(() => {
  localStorage.removeItem(RANDOM_GAME_STATUSES_STORAGE_KEY);
});

describe("randomGamePrefs", () => {
  it("loads defaults when storage is empty", () => {
    expect(loadRandomGameStatuses()).toEqual([...DEFAULT_RANDOM_GAME_STATUSES]);
  });

  it("normalizes unknown values and rejects empty selections", () => {
    expect(normalizeRandomGameStatuses(["playing", "nope", "playing", "completed"]))
      .toEqual(["playing", "completed"]);
    expect(normalizeRandomGameStatuses([])).toBeNull();
    expect(normalizeRandomGameStatuses("wishlist")).toBeNull();
  });

  it("persists a valid selection", () => {
    saveRandomGameStatuses(["completed", "dropped"]);
    expect(loadRandomGameStatuses()).toEqual(["completed", "dropped"]);
  });
});
