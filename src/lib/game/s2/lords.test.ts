import { describe, expect, it } from "vitest";
import { generateMap } from "./map";
import { afterDefeat, companiesHome, fiefCapValue, fiefLoot, garrison, garrisonUnits, newLordS2State, REFORM_MS, settleFief } from "./lords";
import { REF } from "./economy";

const T0 = Date.parse("2026-12-07T15:00:00Z");
const D = 86_400_000;

describe("S2 : seigneurs", () => {
  const map = generateMap(2);
  const duc = map.lords.find((l) => l.rank === "duc")!;
  const hob = map.lords.find((l) => l.rank === "hobereau")!;

  it("garnisons en compagnies pleines selon le rang", () => {
    expect(garrisonUnits(duc.id, "duc")).toHaveLength(10);
    expect(garrisonUnits(hob.id, "hobereau")).toHaveLength(1);
    const g = garrison(duc, newLordS2State(T0), T0, T0 + 9 * D);
    expect(g.companies).toBe(10);
    expect((g.army as Record<string, number>).muraille).toBeGreaterThan(0);
    // Entraînement 8, +1 tous les 4 jours : 10 au jour 9.
    expect(Object.values(g.levels)[0]).toBeGreaterThan(0);
  });

  it("le fief se remplit jusqu'au stock plein, la victoire en emporte 60 % et du fer", () => {
    let ls = settleFief(map, hob, newLordS2State(T0), T0, T0 + 2 * D);
    const v = ls.fief.pierre + ls.fief.fer * 2 + ls.fief.or * 4;
    expect(v).toBeCloseTo(fiefCapValue("hobereau", 2), 0);
    const loot = fiefLoot(ls, 1, T0, T0 + 2 * D);
    expect(loot.fer).toBeGreaterThanOrEqual(Math.floor(0.5 * REF(2) / 2));
    ls = afterDefeat(ls, T0 + 2 * D);
    expect(companiesHome("hobereau", ls, T0 + 2 * D)).toBe(0);
    expect(companiesHome("duc", ls, T0 + 2 * D + REFORM_MS / 2)).toBe(5);
    expect(companiesHome("duc", ls, T0 + 2 * D + REFORM_MS)).toBe(10);
  });
});
