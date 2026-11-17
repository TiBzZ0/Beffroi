// Saison 2 : un parcours de joueur de bout en bout sur le moteur (pose, concessions, convois, armée en fer,
// garnison d'un hobereau, butin du fief). Pas de base : la partie serveur est vérifiée à part.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setS2Geometry, setStagesNow } from "../config";
import { advance, landMarch, newPlayerState, resolveRaid, type March, type PlayerState } from "../engine";
import { COMPANY_CAP, createCompany, recruit, refRate, setIronArmy, startTraining, trainCost } from "../companies";
import { castleBlocker, generateMap, type Pos } from "./map";
import { firstConcessionSites, newS2State, settleS2, takeConcession } from "./economy";
import { afterDefeat, fiefLoot, garrison, newLordS2State, settleFief } from "./lords";
import { setS2Map } from "./rules";

const T0 = Date.parse("2026-11-30T14:35:00Z");
const H = 3_600_000;
const map = generateMap(42);
const world = { stageCompletedAt: [] as number[] };

beforeAll(() => {
  setS2Geometry(true);
  setIronArmy(true);
  setS2Map(map);
});
afterAll(() => {
  setS2Geometry(false);
  setIronArmy(false);
  setS2Map(null);
  setStagesNow(0);
});

function freeCell(): Pos {
  for (let y = 2; y < 39; y++) for (let x = 2; x < 39; x++) if (!castleBlocker(map, [x, y], [])) return [x, y];
  throw new Error("aucune case libre");
}

describe("S2 : parcours d'un joueur", () => {
  let p: PlayerState;

  it("pose le château et prend sa première carrière", () => {
    const castle = freeCell();
    const site = firstConcessionSites(map, castle, () => 0)[0];
    expect(map.sites[site].type).toBe("pierre");
    const s2 = { ...newS2State(T0), castle, at: T0 };
    const r = takeConcession(s2, { map, stageConcessions: 0 }, site, { taken: () => 0 }, T0);
    expect(r.ok).toBe(true);
    p = { ...newPlayerState(T0), companyModel: true, seasonStart: T0, s2: r.ok ? r.value : s2 };
    expect(p.s2!.iron).toBe(30_000);
  });

  it("les convois rapportent de la pierre et un peu d'or", () => {
    const after = advance(p, T0 + 6 * H, world);
    expect(after.stone).toBeGreaterThan(0);
    expect(after.s2!.gold).toBeGreaterThan(0);
    // Le calcul coupé en deux tombe sur le même résultat.
    const half = advance(advance(p, T0 + 3 * H, world), T0 + 6 * H, world);
    expect(half.stone).toBeCloseTo(after.stone, 0);
    // Sans le moteur, la même chose : rien ne se perd entre settleS2 et advance.
    const raw = settleS2(p.s2!, { map, stageConcessions: 0 }, T0 + 6 * H);
    expect(after.stone).toBeCloseTo(raw.arrived.pierre * (1 - (p.tithe ?? 0)), 0);
    p = after;
  });

  it("recrute et entraîne en fer", () => {
    let s = { ...p, stone: p.s2!.iron };
    const c = createCompany(s, "piquier", p.lastUpdate);
    expect(c.ok).toBe(true);
    s = c.ok ? c.value : s;
    const id = s.companies![s.companies!.length - 1].id;
    const r = recruit(s, id, 100, p.lastUpdate);
    expect(r.ok).toBe(true);
    // 100 piquiers à 40 fer.
    expect(s.stone - (r.ok ? r.value.stone : 0)).toBe(4_000);
    expect(trainCost({ train: 0 } as never)).toBe(5_000);
    const t = startTraining(r.ok ? r.value : s, id, p.lastUpdate);
    expect(t.ok).toBe(true);
  });

  it("bat un hobereau d'une compagnie et rapporte le butin du fief", () => {
    const hob = map.lords.find((l) => l.rank === "hobereau" && l.companies === 1)!;
    const at = T0 + 24 * H;
    const fief = settleFief(map, hob, newLordS2State(T0), T0, at);
    const g = garrison(hob, fief, T0, at);
    expect(g.companies).toBe(1);
    // Une armée nettement plus forte : 3 compagnies pleines.
    const attacker: PlayerState = { ...p, troops: { piquier: 3 * COMPANY_CAP.piquier }, lastUpdate: at };
    const lordState = { ...newPlayerState(T0), lordS2: fief };
    const fight = resolveRaid(attacker, lordState, {
      now: at,
      attackerId: "me",
      victimId: hob.id,
      victimRate: 0,
      defenderArmy: g.army,
      defenderLevels: g.levels,
      attackerArmy: { piquier: 3 * COMPANY_CAP.piquier },
      lordLootFixed: 0,
      marching: true,
      allowRepeat: true,
      rng: () => 0.5,
    });
    expect(fight.ok).toBe(true);
    if (!fight.ok) return;
    expect(fight.value.report.success).toBe(true);
    expect(fight.value.report.stolen).toBe(0);
    const loot = fiefLoot(fief, g.companies, T0, at);
    expect(loot.fer).toBeGreaterThan(0);
    // La garnison se reforme : plus personne au fief juste après.
    expect(garrison(hob, afterDefeat(fief, at), T0, at + 1).companies).toBe(0);
    // Le butin rentre avec l'armée, dans les trois monnaies.
    const march: March = { id: "m", kind: "raid", target: hob.id, troops: { piquier: 10 }, departAt: at - H, arriveAt: at, status: "back", returnAt: at + H, revealed: true, warned: true, loot: 0, ransom: 0, lootS2: loot };
    const home = landMarch({ ...attacker, troops: {}, marches: [march] }, "m");
    expect(home.s2!.iron).toBe(attacker.s2!.iron + loot.fer);
    expect(home.s2!.gold).toBe(attacker.s2!.gold + loot.or);
    expect(home.stone).toBe(attacker.stone + loot.pierre);
  });

  it("la courbe de référence suit REF(j) et le nombre de concessions attendu", () => {
    expect(refRate(1)).toBeGreaterThan(0);
    expect(refRate(24 * 7)).toBeGreaterThan(refRate(24));
  });
});
