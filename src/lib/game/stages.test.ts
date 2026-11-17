import { afterEach, describe, expect, it } from "vitest";
import { donorTiersFor, setSeasonRules, stageHours, DONOR_TIERS, DONOR_TIERS_LONG } from "./config";
import { refStone, stageTarget } from "./engine";
import { refRate } from "./companies";

describe("B1 : beffroi étalé (saison 2 et suivantes)", () => {
  afterEach(() => setSeasonRules(1));

  it("la saison 1 garde ses étapes de 4 heures (48 h pour la huitième), sans fin visée", () => {
    setSeasonRules(1);
    expect(stageHours(0)).toBe(4);
    expect(stageHours(7)).toBe(48);
    expect(stageTarget(0, [1e9], 1)).toBe(0);
  });

  it("à partir de la saison 2 : plus d'heures, paliers longs dès 12 h, taille tirée de la fin visée", () => {
    setSeasonRules(2);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(stageHours)).toEqual([8, 12, 16, 24, 24, 36, 48, 72]);
    expect(stageHours(8)).toBe(24);
    expect(donorTiersFor(0)).toBe(DONOR_TIERS);
    expect(donorTiersFor(1)).toBe(DONOR_TIERS_LONG);
    // Un joueur au niveau de référence, un cinq fois au-dessus, un dix fois en dessous : 6,1 joueurs équivalents.
    const ref = refRate(40);
    const size = stageTarget(2, [ref, 5 * ref, ref / 10], 40);
    expect(size / (6.1 * 0.2 * refStone(36, 72))).toBeCloseTo(1, 6);
  });
});
