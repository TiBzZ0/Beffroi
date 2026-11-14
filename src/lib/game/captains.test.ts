import { describe, expect, it } from "vitest";
import { estimateChance } from "./battle";
import { newPlayerState, warFortune, type PlayerState } from "./engine";
import { createCompany, dissolveCompany, retypeCompany } from "./companies";
import { afterBattle, armyBoost, assignCaptain, captainLevel, makeCaptain, relicRarity, type Captain, type Relic } from "./captains";
import { riftFloor, splitLosses, guardianBattle, type RiftExpedition } from "./rift";

const T0 = Date.parse("2026-11-24T10:00:00Z");
const ok = <S,>(r: { ok: true; value: S } | { ok: false; error: string }): S => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const base = (): PlayerState => ok(createCompany({ ...newPlayerState(T0), stone: 1e9, companyModel: true, troops: { piquier: 600 } }, "piquier", T0));
const cap = (trait: Captain["trait"], company: string | null, xp = 0): Captain => ({ ...makeCaptain(trait, undefined, () => 0, T0), xp, company });

describe("Capitaines et reliques", () => {
  it("niveaux à 0, 3, 8, 15 et 25 batailles", () => {
    expect([0, 2.5, 3, 8, 15, 25, 99].map((xp) => captainLevel({ xp }))).toEqual([1, 1, 2, 3, 4, 5, 5]);
  });

  it("un capitaine et une relique renforcent la compagnie", () => {
    const s = base();
    const id = s.companies![0].id;
    const withGear = { ...s, captains: [cap("tenace", id, 25)], relics: [{ id: "r1", kind: "lance", company: id } as Relic] };
    const b = armyBoost(withGear, "attack")!;
    expect(b.atk?.piquier).toBeCloseTo(1.2 * 1.1);
    expect(b.hp?.piquier).toBeCloseTo(1.2);
    const def = { chevalier: 60 };
    expect(estimateChance(s.troops, def, { attackerBoost: b })).toBeGreaterThanOrEqual(estimateChance(s.troops, def, {}));
    // Rempart vivant : seulement en défense.
    const wall = { ...s, captains: [cap("rempart", id)] };
    expect(armyBoost(wall, "defense")!.hp?.piquier).toBeCloseTo(1.04 * 1.3);
    expect(armyBoost(wall, "attack")!.hp?.piquier).toBeCloseTo(1.04);
  });

  it("dissoudre perd la relique et rend le capitaine ; changer de type garde tout", () => {
    const s = base();
    const id = s.companies![0].id;
    const g = { ...s, captains: [cap("tenace", id)], relics: [{ id: "r1", kind: "banniere", company: id } as Relic] };
    const gone = ok(dissolveCompany(g, id));
    expect(gone.relics).toEqual([]);
    expect(gone.captains?.[0].company).toBeNull();
    const re = ok(retypeCompany(g, id, "arbaletrier"));
    expect(re.relics?.[0].company).toBe(id);
    expect(re.captains?.[0].company).toBe(id);
  });

  it("un seul capitaine par compagnie", () => {
    const s = base();
    const id = s.companies![0].id;
    const g = { ...s, captains: [cap("tenace", id), cap("veinard", null)] };
    const moved = ok(assignCaptain(g, g.captains[1].id, id));
    expect(moved.captains!.filter((k) => k.company === id)).toHaveLength(1);
  });

  it("Tenace, Écu des anciens, expérience et mort", () => {
    const s = base();
    const id = s.companies![0].id;
    const t = afterBattle({ ...s, captains: [cap("tenace", id)] }, { [id]: 600 }, { [id]: 600 }, true, () => 0.9);
    expect(t.cut[id]).toBe(540);
    expect(t.state.captains?.[0].xp).toBe(1);
    const e = afterBattle({ ...s, relics: [{ id: "r", kind: "ecu", company: id } as Relic] }, { [id]: 600 }, { [id]: 500 }, false, () => 0.9);
    expect(e.cut[id]).toBe(300);
    const dead = afterBattle({ ...s, captains: [cap("veinard", id)] }, { [id]: 600 }, { [id]: 590 }, false, () => 0);
    expect(dead.dead).toHaveLength(1);
    expect(dead.state.captains).toHaveLength(0);
  });

  it("Veinard borne la fortune ; les gardiens donnent au moins une rare", () => {
    const s = base();
    expect(warFortune({ ...s, captains: [cap("veinard", s.companies![0].id)] })).toEqual({ min: 0.95, max: 1.2 });
    expect(warFortune(s)).toBe(true);
    for (const roll of [0, 0.5, 0.99]) expect(relicRarity(10, true, roll)).not.toBe("commune");
  });

  it("gardien : une bataille commune, pertes réparties au prorata", () => {
    const e = (troops: Record<string, number>): RiftExpedition => ({ by: {}, troops, wounded: {}, floor: 10, status: "wait", arriveAt: 0, returnAt: 0, travel: 0, lastAt: 0, week: "w", fights: [] });
    const parts = [{ e: e({ piquier: 300 }) }, { e: e({ piquier: 100, chevalier: 50 }) }];
    expect(splitLosses(parts, { piquier: 40, chevalier: 10 })).toEqual([{ piquier: 30 }, { piquier: 10, chevalier: 10 }]);
    const g = guardianBattle(parts.map((p) => ({ s: base(), e: p.e })), riftFloor("w", 10));
    expect(g.troops).toEqual({ piquier: 400, chevalier: 50 });
  });
});
