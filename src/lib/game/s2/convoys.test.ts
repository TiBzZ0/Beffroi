import { describe, expect, it } from "vitest";
import { createCompany, menOf } from "../companies";
import { advance } from "../engine";
import { COMPANY_CAP } from "../companies";
import { MAP, s2Player, useS2 } from "./fixture";
import {
  addHostility,
  afterLordAttack,
  buySafe,
  contractsFor,
  convoyRisk,
  fightChance,
  freePass,
  hostilityAt,
  line,
  lossCap,
  pillageBlocker,
  pillageLoot,
  protectedUntil,
  routeFight,
  safePrice,
  setEscort,
  takeContract,
  zonesOnRoute,
  type RouteContext,
} from "./convoys";
import { newS2State, type Convoy, type S2State } from "./economy";
import { cheb, RANKS, type Pos } from "./map";

const T0 = Date.parse("2026-12-07T15:00:00Z");
const H = 3_600_000;
const duke = () => MAP.lords.find((l) => l.rank === "duc")!;

/** Un trajet qui passe au milieu de la zone d'un seigneur. */
function through(l = duke()): { from: Pos; to: Pos } {
  const z = RANKS[l.rank].zone;
  return { from: [Math.max(0, l.pos[0] - z - 3), l.pos[1]], to: [Math.min(40, l.pos[0] + z + 3), l.pos[1]] };
}
const rc = (escort: RouteContext["escort"] = () => null): RouteContext => ({ map: MAP, seasonStart: T0, stagesDone: 0, escort, hurt: () => {} });
const convoy = (from: Pos, to: Pos, depart: number, load = 900): Convoy => ({ conc: "c1", res: "pierre", load, depart, arrive: depart + 10 * 60_000, from, to });
/** Sauf-conduits chez tous les autres seigneurs de la route : seul le duc reste dangereux. */
const othersSafe = (): Record<string, number> => {
  const { from, to } = through();
  return Object.fromEntries(zonesOnRoute(MAP, from, to).filter((z) => z.lord.id !== duke().id).map((z) => [z.lord.id, T0 + 999 * H]));
};
const state = (): S2State => ({ ...newS2State(T0), castle: [2, 2], who: { id: "moi", alliance: null }, safe: othersSafe() });

describe("S2 vague B : routes", () => {
  useS2();
  it("le trajet en ligne droite va d'un bout à l'autre, case par case", () => {
    const cells = line([0, 0], [5, 3]);
    expect(cells[0]).toEqual([0, 0]);
    expect(cells[cells.length - 1]).toEqual([5, 3]);
    for (let i = 1; i < cells.length; i++) expect(cheb(cells[i], cells[i - 1])).toBe(1);
  });

  it("une route qui traverse une zone la croise une seule fois", () => {
    const { from, to } = through();
    const z = zonesOnRoute(MAP, from, to);
    expect(z.filter((x) => x.lord.id === duke().id)).toHaveLength(1);
  });

  it("combat d'escorte : à armées égales une chance sur deux, plus forte gagne plus souvent", () => {
    const a = { army: { piquier: 600 } };
    expect(fightChance(a, a)).toBeCloseTo(0.5);
    expect(fightChance({ army: { piquier: 1200 } }, a)).toBeGreaterThan(0.8);
    expect(routeFight(null, a, "x").won).toBe(false);
  });

  it("règle du tiers : un convoi sans escorte ne perd jamais plus d'un tiers, et seulement s'il est attaqué", () => {
    const { from, to } = through();
    let attacked = 0;
    for (let i = 0; i < 40; i++) {
      const st = state();
      const v = convoy(from, to, T0 + i * 15 * 60_000);
      const lost = convoyRisk(st, v, rc());
      expect(lost).toBeLessThanOrEqual(v.load * lossCap(0) + 1e-9);
      if (lost > 0) attacked++;
      // Traverser la zone sans sauf-conduit fait monter l'hostilité.
      expect(hostilityAt(st, duke().id, v.arrive)).toBeGreaterThan(0);
    }
    // Duc : 40 % d'attaque par traversée.
    expect(attacked).toBeGreaterThan(5);
    expect(attacked).toBeLessThan(30);
    expect(lossCap(5)).toBe(0.25);
  });

  it("un sauf-conduit ou un vassal donne le passage libre", () => {
    const { from, to } = through();
    const st = { ...state(), safe: { ...othersSafe(), [duke().id]: T0 + 48 * H } };
    for (let i = 0; i < 20; i++) expect(convoyRisk(st, convoy(from, to, T0 + i * 15 * 60_000), rc())).toBe(0);
    expect(hostilityAt(st, duke().id, T0)).toBe(0);
    expect(freePass({ ...state(), vassals: { [duke().id]: T0 + H } }, duke().id, T0)).toBe(true);
  });

  it("hostilité : multipliée par le rang, elle baisse de 10 par jour", () => {
    const st = state();
    addHostility(st, MAP, duke(), 10, T0);
    expect(hostilityAt(st, duke().id, T0)).toBe(15);
    expect(hostilityAt(st, duke().id, T0 + 12 * H)).toBeCloseTo(10);
    expect(hostilityAt(st, duke().id, T0 + 3 * 24 * H)).toBe(0);
  });

  it("sauf-conduit : payé en or, hostilité −10, refusé à un ennemi juré", () => {
    const l = duke();
    const st = { ...state(), gold: 1_000_000 };
    addHostility(st, MAP, l, 20, T0);
    const price = safePrice(st, l, T0, T0)!;
    const r = buySafe(st, MAP, l.id, T0, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.s.gold).toBe(1_000_000 - price);
    expect(hostilityAt(r.value.s, l.id, T0)).toBe(20);
    addHostility(st, MAP, l, 60, T0);
    expect(safePrice(st, l, T0, T0)).toBeNull();
  });

  it("victoire sur un seigneur : vassal 24 h, rancune, et un sauf-conduit rompu coûte cher", () => {
    const l = duke();
    const won = afterLordAttack(state(), MAP, l.id, T0, true);
    expect(won.vassals?.[l.id]).toBe(T0 + 24 * H);
    expect(won.grudge?.length).toBeGreaterThanOrEqual(1);
    expect(won.grudge![0].due).toBeLessThanOrEqual(T0 + 12 * H);
    const betrayed = afterLordAttack({ ...state(), safe: { [l.id]: T0 + H } }, MAP, l.id, T0, false);
    expect(betrayed.safe?.[l.id]).toBeUndefined();
    expect(hostilityAt(betrayed, l.id, T0)).toBe(45);
    expect(betrayed.grudge).toHaveLength(2);
  });
});

describe("S2 vague B : pillage et escortes", () => {
  useS2();
  it("butin : 25 % du stock, 15 % de la réserve ; protection 48 h ; une fois toutes les 6 h", () => {
    const p = s2Player(T0);
    const c = { ...p.s2!.conc[0], stock: 1000, fund: 400 };
    const loot = pillageLoot(c, MAP, 0);
    expect(loot.stock).toBe(250);
    expect(loot.fund).toBe(60);
    const s2 = { ...p.s2!, conc: [c], launchUntil: T0 + 24 * H };
    expect(protectedUntil(s2)).toBe(T0 + 48 * H);
    expect(pillageBlocker(s2, c.id, T0 + H, { allied: false, sameIp: false })).toMatch(/protégé/);
    expect(pillageBlocker(s2, c.id, T0 + 49 * H, { allied: false, sameIp: false })).toBeNull();
    expect(pillageBlocker({ ...s2, conc: [{ ...c, raidedAt: T0 + 47 * H }] }, c.id, T0 + 49 * H, { allied: false, sameIp: false })).toMatch(/6 h/);
    expect(pillageBlocker(s2, c.id, T0 + 49 * H, { allied: true, sameIp: false })).toMatch(/allié/);
  });

  it("une escorte prend les hommes au château sans en perdre, et les rend", () => {
    let p = s2Player(T0);
    const made = createCompany(p, "piquier", T0);
    if (!made.ok) throw new Error(made.error);
    p = { ...made.value, troops: { ...made.value.troops, piquier: COMPANY_CAP.piquier } };
    const company = p.companies!.find((c) => c.unit === "piquier")!;
    const before = menOf(p, "piquier");
    const r = setEscort(p, p.s2!.conc[0].id, company.id, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.troops.piquier ?? 0).toBe(0);
    expect(menOf(r.value, "piquier")).toBe(before);
    expect(r.value.escorts).toEqual([{ company: company.id, conc: p.s2!.conc[0].id, men: COMPANY_CAP.piquier }]);
    // Le calcul du temps garde l'escorte.
    const later = advance(r.value, T0 + 6 * H, { stageCompletedAt: [] });
    expect(menOf(later, "piquier")).toBeLessThanOrEqual(before);
    expect(later.escorts?.length ?? 0).toBeLessThanOrEqual(1);
    const back = setEscort(r.value, p.s2!.conc[0].id, null, T0);
    expect(back.ok && back.value.troops.piquier).toBe(COMPANY_CAP.piquier);
  });

  it("contrats : trois au plus, chacun ne se prend qu'une fois", () => {
    const p = s2Player(T0);
    const list = contractsFor(p.s2!, MAP, "moi", 100, T0, T0);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(3);
    const after = takeContract(p.s2!, 100, list[0].id);
    expect(contractsFor(after, MAP, "moi", 100, T0, T0).map((c) => c.id)).not.toContain(list[0].id);
    expect(contractsFor(after, MAP, "moi", 101, T0, T0).length).toBeGreaterThan(0);
  });
});

describe("S2 vague B : réglages après les essais", () => {
  useS2();
  it("sur la route, le perdant se replie à la moitié de ses hommes", () => {
    const us = { army: { milicien: 1000 } };
    const f = routeFight(us, { army: { piquier: 3000 } }, "retraite");
    expect(f.won).toBe(false);
    expect(Object.values(f.lost).reduce((a, b) => a + (b ?? 0), 0)).toBeLessThanOrEqual(500);
  });

  it("un vassal ne lance pas sa rancune contre son suzerain", () => {
    const { from, to } = through();
    const st: S2State = { ...state(), grudge: [{ lord: duke().id, due: T0 }], vassals: { [duke().id]: T0 + 24 * H }, safe: { ...othersSafe(), [duke().id]: T0 + 48 * H } };
    convoyRisk(st, convoy(from, to, T0 + H), rc());
    expect(st.grudge).toHaveLength(1);
  });

  it("la récompense d'un contrat dépend du rang et du type", () => {
    const p = s2Player(T0);
    const list = contractsFor(p.s2!, MAP, "moi", 100, T0, T0);
    const golds = new Set(contractsFor(p.s2!, MAP, "moi", 100, T0, T0).concat(contractsFor(p.s2!, MAP, "toi", 101, T0, T0)).map((c) => c.gold));
    expect(list.every((c) => c.gold > 0)).toBe(true);
    expect(golds.size).toBeGreaterThan(1);
  });
});
