import { afterEach, describe, expect, it } from "vitest";
import { BELFRY_POS, LORD_GIFT_MAX_SHARE, setS2Geometry, setStagesNow, STAGES, stagePerkNow } from "../config";
import { riftFloor, RIFT_GUARDIAN_EVERY } from "../rift";
import { maxCompanies } from "../companies";

afterEach(() => {
  setS2Geometry(false);
  setStagesNow(0);
});

describe("S6 : étapes du beffroi en saison 2", () => {
  it("bascule les étapes, le centre et la part des seigneurs bâtisseurs", () => {
    setS2Geometry(true);
    expect(STAGES[0].bonus.production).toBeUndefined();
    expect(STAGES[7].bonus.production).toBeCloseTo(1.1);
    expect(BELFRY_POS).toEqual([20, 20]);
    expect(LORD_GIFT_MAX_SHARE).toBe(0.1);
    setS2Geometry(false);
    expect(STAGES[0].bonus.production).toBeCloseTo(1.1);
  });

  it("gargouilles : gardiens −15 % ; horloge : une compagnie de plus", () => {
    setS2Geometry(true);
    const before = riftFloor("2026-W48", RIFT_GUARDIAN_EVERY);
    const holder = { troops: {}, defenses: {}, wounded: {}, levels: {} } as never;
    const base = maxCompanies(holder);
    setStagesNow(4);
    expect(stagePerkNow("guardianWeak")).toBeCloseTo(0.15);
    const after = riftFloor("2026-W48", RIFT_GUARDIAN_EVERY);
    expect(before.guardian).toBe(true);
    expect(Object.values(after.army).reduce((a, b) => a + b, 0)).toBeLessThan(Object.values(before.army).reduce((a, b) => a + b, 0));
    setStagesNow(7);
    expect(maxCompanies(holder)).toBe(base + 1);
  });
});
