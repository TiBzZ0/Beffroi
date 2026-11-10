import { describe, expect, it } from "vitest";
import { armyForChance, battle, estimateChance, seededRng } from "./battle";
import { academyCost, advance, applySabotage, buyAcademy, newPlayerState, researchCost, researchTime, sabotageBlocker, startResearch } from "./engine";

const world = { stageCompletedAt: [] };

describe("améliorations militaires", () => {
  it("une recherche coûte de la pierre, prend du temps et monte d'un niveau à la fin", () => {
    const s = { ...newPlayerState(0), stone: 1e9 };
    const cost = researchCost(s, "piquier");
    const time = researchTime(s, "piquier");
    const r = startResearch(s, "piquier", 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.stone).toBe(1e9 - cost);
    expect(advance(r.value, time - 1, world).levels.piquier ?? 0).toBe(0);
    const done = advance(r.value, time, world);
    expect(done.levels.piquier).toBe(1);
    expect(done.research).toEqual([]);
    expect(researchTime(done, "piquier")).toBeGreaterThan(time);
  });

  it("la file accepte 3 recherches qui s'enchaînent, pas une de plus", () => {
    let s = { ...newPlayerState(0), stone: 1e12 };
    for (const id of ["piquier", "piquier", "milicien"]) {
      const r = startResearch(s, id, 0);
      expect(r.ok).toBe(true);
      if (r.ok) s = r.value;
    }
    expect(startResearch(s, "chevalier", 0).ok).toBe(false);
    expect(s.research[1].endsAt).toBeGreaterThan(s.research[0].endsAt);
    const end = advance(s, s.research[2].endsAt, world);
    expect(end.levels).toMatchObject({ piquier: 2, milicien: 1 });
    expect(end.research).toEqual([]);
  });

  it("l'académie raccourcit les recherches et coûte de plus en plus cher", () => {
    const s = { ...newPlayerState(0), stone: 1e12 };
    const before = researchTime(s, "chevalier");
    const r = buyAcademy(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(researchTime(r.value, "chevalier")).toBeLessThan(before);
    expect(academyCost(r.value)).toBeGreaterThan(academyCost(s));
  });

  it("un sabotage abat un niveau d'académie, retarde la recherche et protège la cible", () => {
    const s = { ...newPlayerState(0), academy: 2, research: [{ id: "piquier" as const, endsAt: 1000 }, { id: "milicien" as const, endsAt: 1500 }] };
    const hit = applySabotage(s, 0);
    expect(hit.academy).toBe(1);
    expect(hit.research.map((r) => r.endsAt)).toEqual([1200, 1700]);
    expect(sabotageBlocker(hit, 10)).not.toBeNull();
    expect(sabotageBlocker(newPlayerState(0), 0)).not.toBeNull();
  });

  it("des niveaux plus élevés font gagner une bataille équilibrée", () => {
    const army = { piquier: 100, arbaletrier: 100 };
    const even = estimateChance(army, army);
    const strong = estimateChance(army, army, { attackerLevels: { piquier: 5, arbaletrier: 5 } });
    expect(strong).toBeGreaterThan(even);
    const fight = battle(army, army, seededRng(1), { defenderLevels: { piquier: 10, arbaletrier: 10 } });
    expect(Object.values(fight.attackerLost).reduce((a, b) => a + (b ?? 0), 0)).toBeGreaterThan(Object.values(fight.defenderLost).reduce((a, b) => a + (b ?? 0), 0));
  });
});

describe("seigneurs attaquants", () => {
  it("l'armée vise une chance d'environ un tiers contre la défense de la cible", () => {
    const defense = { piquier: 300, arbaletrier: 200, tour: 50, palissade: 100, garde: 3 };
    const army = armyForChance({ chevalier: 10, milicien: 30 }, defense, 1 / 3);
    const chance = estimateChance(army, defense);
    expect(chance).toBeGreaterThan(0.1);
    expect(chance).toBeLessThan(0.6);
  });
});

describe("rapport de bataille (B7)", () => {
  it("détaille chaque round et retombe sur les pertes totales", () => {
    const fight = battle({ piquier: 40, arbaletrier: 20 }, { milicien: 30, palissade: 5 }, seededRng(3));
    expect(fight.log).toHaveLength(fight.rounds);
    const sum = (k: "attackerLost" | "defenderLost") =>
      fight.log.reduce((a, r) => a + Object.values(r[k]).reduce((x, n) => x + (n ?? 0), 0), 0);
    expect(sum("attackerLost")).toBe(Object.values(fight.attackerLost).reduce((x, n) => x + (n ?? 0), 0));
    expect(sum("defenderLost")).toBe(Object.values(fight.defenderLost).reduce((x, n) => x + (n ?? 0), 0));
  });
});
