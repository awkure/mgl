import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertProgressCompatible,
  createEmptyProgress,
  loadForContinue,
  removeProgress,
  upsertAchievement,
  upsertDetail,
  validateProgress,
  writeAtomic,
} from "../scripts/lib/steamImportProgress.mjs";

const FLAGS = {
  noCovers: true,
  noAchievements: false,
  skipDetails: false,
  force: false,
  playedOnly: false,
};

describe("steamImportProgress", () => {
  it("createEmptyProgress has v1 empty maps", () => {
    const p = createEmptyProgress("7656119", FLAGS, "2026-07-22T12:00:00.000Z");
    expect(p).toMatchObject({
      version: 1,
      profileKey: "7656119",
      flags: FLAGS,
      details: {},
      achievements: {},
    });
  });

  it("validateProgress rejects bad version", () => {
    expect(validateProgress({ version: 2, profileKey: "x", flags: FLAGS, details: {}, achievements: {} }).ok).toBe(false);
  });

  it("assertProgressCompatible rejects flag mismatch", () => {
    const p = createEmptyProgress("7656119", FLAGS, "2026-07-22T12:00:00.000Z");
    expect(() =>
      assertProgressCompatible(p, "7656119", { ...FLAGS, force: true }),
    ).toThrow(/flags/i);
  });

  it("loadForContinue requires existing file", () => {
    const dir = mkdtempSync(join(tmpdir(), "steam-progress-"));
    expect(() => loadForContinue(join(dir, "missing.json"), "7656119", FLAGS)).toThrow(/--continue|missing/i);
  });

  it("loadForContinue rejects invalid JSON with Invalid progress file prefix", () => {
    const dir = mkdtempSync(join(tmpdir(), "steam-progress-"));
    const file = join(dir, "steam-import-progress.json");
    writeFileSync(file, "{ not json", "utf8");
    expect(() => loadForContinue(file, "7656119", FLAGS)).toThrow(/^Invalid progress file:/);
  });

  it("upsert + writeAtomic round-trip", () => {
    const dir = mkdtempSync(join(tmpdir(), "steam-progress-"));
    const file = join(dir, "steam-import-progress.json");
    let p = createEmptyProgress("7656119", FLAGS, "2026-07-22T12:00:00.000Z");
    p = upsertDetail(p, 220, { ok: true, value: { name: "HL2" }, name: "Half-Life 2" }, "2026-07-22T12:01:00.000Z");
    p = upsertAchievement(p, 220, { ok: true, unlocked: 1, total: 10 }, "2026-07-22T12:02:00.000Z");
    writeAtomic(file, p);
    const loaded = loadForContinue(file, "7656119", FLAGS);
    expect(loaded.details["220"]).toEqual({
      ok: true,
      value: { name: "HL2" },
      name: "Half-Life 2",
    });
    expect(loaded.achievements["220"]).toEqual({ ok: true, unlocked: 1, total: 10 });
    removeProgress(file);
    expect(existsSync(file)).toBe(false);
  });

  it("upsert failure entries round-trip via writeAtomic and loadForContinue", () => {
    const dir = mkdtempSync(join(tmpdir(), "steam-progress-"));
    const file = join(dir, "steam-import-progress.json");
    let p = createEmptyProgress("7656119", FLAGS, "2026-07-22T12:00:00.000Z");
    p = upsertDetail(p, 570, { ok: false, error: "store timeout" }, "2026-07-22T12:01:00.000Z");
    p = upsertAchievement(p, 570, { ok: false, error: "achievements private" }, "2026-07-22T12:02:00.000Z");
    writeAtomic(file, p);
    const loaded = loadForContinue(file, "7656119", FLAGS);
    expect(loaded.details["570"]).toEqual({ ok: false, error: "store timeout" });
    expect(loaded.achievements["570"]).toEqual({ ok: false, error: "achievements private" });
  });
});
