import { describe, expect, it } from "vitest";
import { mapDistance } from "./config";
import { hallSpots, hallStageCost, wingBlocker } from "./hall";
import { addWounded, armySpeedBonus, extraSecured, newPlayerState, productionMultiplier, travelMs } from "./engine";

describe("halle de guilde", () => {
  it("coûte 35 heures de production pour les dix étapes", () => {
    let hours = 0;
    for (let n = 1; n <= 10; n++) hours += hallStageCost(n, 1) / 3600;
    expect(hours).toBeGreaterThan(34.5);
    expect(hours).toBeLessThan(35.5);
  });

  it("atteint l'étape 6 ou 7 en versant 5 % de sa production d'ici la fin de saison", () => {
    // 12 jours à 5 %, production qui double sur la période.
    let stage = 0;
    let progress = 0;
    let cost = hallStageCost(1, 1);
    for (let h = 0; h < 12 * 24; h++) {
      const rate = Math.pow(2, h / (12 * 24));
      progress += rate * 3600 * 0.05;
      while (stage < 10 && progress >= cost) {
        progress -= cost;
        stage++;
        cost = hallStageCost(stage + 1, rate);
      }
    }
    expect(stage).toBeGreaterThanOrEqual(6);
    expect(stage).toBeLessThanOrEqual(7);
  });

  it("répartit dix niveaux, trois au plus par aile, deux ailes pour une loge", () => {
    expect(wingBlocker({}, "loge", 0, false)).toMatch(/Aucun niveau/);
    expect(wingBlocker({ loge: 3 }, "loge", 5, false)).toMatch(/plus haut/);
    expect(wingBlocker({ loge: 1, guet: 1 }, "ecuries", 4, true)).toMatch(/2 ailes/);
    expect(wingBlocker({ loge: 1, guet: 1 }, "guet", 4, true)).toBeNull();
  });

  it("se pose près d'un membre et loin des autres lieux", () => {
    const home: [number, number] = [5, 5];
    const spots = hallSpots(home, [home], [home, [7, 5]]);
    expect(spots.length).toBeGreaterThan(0);
    for (const c of spots) {
      expect(mapDistance(c, home)).toBeLessThanOrEqual(3);
      expect(mapDistance(c, [7, 5])).toBeGreaterThanOrEqual(2);
    }
  });

  it("donne ses effets aux membres", () => {
    const s = { ...newPlayerState(0), hall: { loge: 2, grenier: 1, ecuries: 3, armes: 1, infirmerie: 3 } };
    const base = newPlayerState(0);
    const world = { stageCompletedAt: [] };
    expect(productionMultiplier(s, world, 0) / productionMultiplier(base, world, 0)).toBeCloseTo(1.06);
    expect(extraSecured(s, 0) - extraSecured(base, 0)).toBe(1800);
    expect(armySpeedBonus(s)).toBeCloseTo(0.3);
    expect(armySpeedBonus(s, true)).toBeCloseTo(0.5);
    expect(travelMs({ piquier: 10 }, 8, 0.3)).toBeLessThan(travelMs({ piquier: 10 }, 8));
    expect(addWounded(s, { piquier: 2 }, 0).healAt).toBe(15 * 60_000);
  });
});
