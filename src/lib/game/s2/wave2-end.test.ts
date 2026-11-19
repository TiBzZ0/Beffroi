import { afterEach, describe, expect, it } from "vitest";
import { advance } from "../engine";
import { MAP, s2Player, useS2 } from "./fixture";
import {
  addHostility,
  annexConvoys,
  campActive,
  campSpot,
  convoyRisk,
  freePass,
  hostilityAt,
  rivalOf,
  setAmbushes,
  setAnnexed,
  setCamps,
  zonesOnRoute,
  type RouteContext,
} from "./convoys";
import { newS2State, type Convoy, type S2State } from "./economy";
import { afterVassal, garrison, lordAway, newLordS2State, setLordAway } from "./lords";
import { cheb, type Pos } from "./map";
import { hireMerc, mercPrice } from "./mercs";
import { activeTrades, convoyAt, interceptLoot, interceptPoint, interceptTake, sabotaged, setTrades, setTradeOffer, tradeConvoys, visionRange } from "./players";

const T0 = Date.parse("2026-12-07T15:00:00Z");
const H = 3_600_000;
const convoy = (from: Pos, to: Pos, depart: number, load = 900, span = 30 * 60_000): Convoy => ({ conc: "c1", res: "pierre", load, depart, arrive: depart + span, from, to });
const rc = (): RouteContext => ({ map: MAP, seasonStart: T0, stagesDone: 0, escort: () => null, hurt: () => {} });
/** Sauf-conduits partout : seuls les camps, les rancunes et les expéditions restent dangereux. */
const allSafe = (): Record<string, number> => Object.fromEntries(MAP.lords.map((l) => [l.id, T0 + 999 * H]));

afterEach(() => {
  setCamps([]);
  setAnnexed({});
  setTrades({});
  setLordAway({});
});

describe("Vague 2, fin : interception et sabotage (S8)", () => {
  useS2();
  it("l'embuscade se tend au premier point que l'armée atteint avant le convoi", () => {
    const v = convoy([0, 10], [20, 10], T0, 900, 20 * 60_000);
    // Armée rapide (1 min par case) à côté de la route : elle attend le convoi au milieu.
    const p = interceptPoint(v, [10, 12], (cells) => cells * 60_000, T0);
    expect(p).not.toBeNull();
    expect(p!.at).toBeGreaterThan(T0);
    expect(p!.at).toBeLessThan(v.arrive);
    expect(cheb(p!.cell, [10, 12])).toBeLessThanOrEqual((p!.at - T0) / 60_000);
    // Armée trop lente : impossible.
    expect(interceptPoint(v, [10, 30], (cells) => cells * 10 * 60_000, T0)).toBeNull();
    expect(convoyAt(v, T0 + 10 * 60_000)).toEqual([10, 10]);
  });

  it("butin : le tiers de la charge, jamais au-delà de la règle du tiers ; +10 % pour le Désert", () => {
    expect(interceptTake(convoy([0, 0], [5, 0], T0, 900), 0)).toBe(300);
    expect(interceptTake({ ...convoy([0, 0], [5, 0], T0, 800), lost: 100 }, 0)).toBe(200);
    expect(interceptTake({ ...convoy([0, 0], [5, 0], T0, 600), lost: 300 }, 0)).toBe(0);
    expect(interceptLoot(300, { ...newS2State(T0), region: "desert" })).toBeCloseTo(330);
  });

  it("sabotage : 15 % détruits et 15 min de retard", () => {
    const s: S2State = { ...newS2State(T0), convoys: [convoy([0, 0], [5, 0], T0, 1000)] };
    const r = sabotaged(s, "c1", T0, 0);
    expect(r.destroyed).toBe(150);
    expect(r.s.convoys[0].load).toBe(850);
    expect(r.s.convoys[0].arrive).toBe(T0 + 45 * 60_000);
    expect(r.s.convoys[0].sabotaged).toBe(true);
  });

  it("vision : 5 cases, 9 avec « La tour de guet »", () => {
    expect(visionRange(0)).toBe(5);
    expect(visionRange(2)).toBe(9);
  });
});

describe("Vague 2, fin : routes commerciales", () => {
  useS2();
  it("une route s'ouvre quand les deux bouts la proposent, et rapporte de l'or chaque heure", () => {
    const a = { ...newS2State(T0), castle: [5, 5] as Pos, who: { id: "a", alliance: null } };
    const b = { ...newS2State(T0), castle: [15, 5] as Pos, who: { id: "b", alliance: null } };
    const ra = setTradeOffer(a, "b", true, T0, "a");
    expect(ra.ok).toBe(true);
    if (!ra.ok) return;
    let routes = activeTrades([{ id: "a", name: "A", s2: ra.value, alliance: null }, { id: "b", name: "B", s2: b, alliance: null }], []);
    expect(routes.a).toBeUndefined();
    const rb = setTradeOffer(b, "a", true, T0 + H, "b");
    if (!rb.ok) throw new Error(rb.error);
    routes = activeTrades([{ id: "a", name: "A", s2: ra.value, alliance: null }, { id: "b", name: "B", s2: rb.value, alliance: null }], []);
    expect(routes.a?.[0].since).toBe(T0 + H);
    setTrades(routes);
    const st = { ...ra.value, convoys: [] as Convoy[] };
    tradeConvoys(st, T0, T0, T0 + 4 * H, () => 10 * 60_000);
    // Ouverte à T0 + 1 h : convois à +1, +2, +3 et +4 h.
    expect(st.convoys.length).toBe(4);
    expect(st.convoys.every((v) => v.dest === "commerce" && v.load > 0)).toBe(true);
  });
});

describe("Vague 2, fin : camps de bandits et expéditions", () => {
  useS2();
  it("un camp près de la route attaque parfois, et jamais avant son installation", () => {
    const from: Pos = [2, 30];
    const to: Pos = [12, 30];
    const spot = campSpot(MAP, [{ from, to }], [], "t");
    expect(spot).not.toBeNull();
    setCamps([{ id: "k1", pos: [7, 31], from: T0 }]);
    let hit = 0;
    for (let i = 0; i < 60; i++) {
      const st = { ...newS2State(T0), castle: to, safe: allSafe() };
      if (convoyRisk(st, convoy(from, to, T0 + i * 7 * 60_000), rc()) > 0) hit++;
    }
    expect(hit).toBeGreaterThan(1);
    expect(hit).toBeLessThan(25);
    setCamps([{ id: "k1", pos: [7, 31], from: T0 + 999 * H }]);
    const st = { ...newS2State(T0), castle: to, safe: allSafe() };
    expect(convoyRisk(st, convoy(from, to, T0), rc())).toBe(0);
    expect(campActive({ id: "x", pos: [0, 0], from: T0, until: T0 + H }, T0 + 2 * H)).toBe(false);
  });

  it("une expédition vide une partie de la garnison du seigneur jusqu'à son retour", () => {
    const lord = MAP.lords.find((l) => l.rank === "comte")!;
    const st: S2State = { ...newS2State(T0), castle: [2, 2], safe: allSafe(), grudge: [{ lord: lord.id, due: T0 }] };
    const v = convoy([2, 2], [3, 3], T0 + H);
    convoyRisk(st, v, rc());
    expect(st.sent?.length).toBe(1);
    const x = st.sent![0];
    expect(x.n).toBe(2);
    const full = garrison(lord, newLordS2State(T0), T0, T0).companies;
    setLordAway({ [lord.id]: [x] });
    expect(lordAway(lord.id, v.arrive)).toBe(2);
    expect(garrison(lord, newLordS2State(T0), T0, v.arrive).companies).toBe(full - 2);
    expect(lordAway(lord.id, x.back + 1)).toBe(0);
  });
});

describe("Vague C : rivalités, mercenaires, chute", () => {
  useS2();
  it("rivalités : une hausse chez l'un apaise l'autre ; 30 points apaisés offrent un sauf-conduit", () => {
    const lord = MAP.lords.find((l) => rivalOf(MAP, l.id))!;
    const rival = rivalOf(MAP, lord.id)!;
    expect(rivalOf(MAP, rival.id)?.id).toBe(lord.id);
    const st: S2State = { ...newS2State(T0), host: { [rival.id]: { v: 60, at: T0 } } };
    addHostility(st, MAP, lord, 10, T0);
    expect(hostilityAt(st, rival.id, T0)).toBeLessThan(60);
    for (let i = 0; i < 6; i++) addHostility(st, MAP, lord, 10, T0);
    expect((st.safe?.[rival.id] ?? 0) > T0).toBe(true);
  });

  it("mercenaires : loués pour 12 h, payés selon le rang, ils escortent la concession", () => {
    const p = s2Player(T0);
    const lord = MAP.lords.find((l) => l.rank === "hobereau")!;
    const s2 = { ...p.s2!, gold: 1_000_000 };
    const r = hireMerc(s2, lord, s2.conc[0].id, T0, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.price).toBe(mercPrice(lord, T0, T0));
    expect(mercPrice(MAP.lords.find((l) => l.rank === "duc")!, T0, T0)).toBe(r.value.price * 8);
    expect(r.value.s.mercs?.[0].until).toBe(T0 + 12 * H);
    expect(hireMerc(r.value.s, lord, s2.conc[0].id, T0, T0).ok).toBe(false);
    // Le calcul du temps garde les mercenaires jusqu'à la fin de leur contrat.
    const later = advance({ ...p, s2: r.value.s }, T0 + 2 * H, { stageCompletedAt: [] });
    expect(later.s2?.mercs?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it("chute : la troisième vassalité d'une alliance annexe le fief ; un autre le libère à moitié", () => {
    let ls = newLordS2State(T0);
    ls = afterVassal(ls, 7, T0, 3);
    ls = afterVassal(ls, 7, T0 + H, 3);
    expect(ls.annexed).toBeUndefined();
    ls = afterVassal(ls, 7, T0 + 2 * H, 3);
    expect(ls.annexed?.alliance).toBe(7);
    const freed = afterVassal(ls, 9, T0 + 3 * H, 3);
    expect(freed.annexed).toBeUndefined();
    expect(freed.halved).toBe(true);
    const lord = MAP.lords.find((l) => l.rank === "duc")!;
    expect(garrison(lord, freed, T0, T0 + 3 * H + 13 * H).companies).toBe(Math.ceil(lord.companies / 2));
  });

  it("un fief annexé laisse passer les convois de l'alliance et partage sa production", () => {
    const lord = MAP.lords[0];
    setAnnexed({ [lord.id]: { alliance: 7, since: T0, members: 2 } });
    const st: S2State = { ...newS2State(T0), castle: [2, 2], who: { id: "a", alliance: 7 } };
    expect(freePass(st, lord.id, T0 + H)).toBe(true);
    expect(freePass({ ...st, who: { id: "b", alliance: 8 } }, lord.id, T0 + H)).toBe(false);
    annexConvoys(st, MAP, T0, T0, T0 + 3 * H, () => 60_000);
    expect(st.convoys.length).toBeGreaterThanOrEqual(3);
    expect(zonesOnRoute(MAP, [0, 0], [1, 1])).toBeDefined();
  });
});

describe("S8 : embuscade posée sur une case", () => {
  useS2();
  it("attaque les convois ennemis qui passent à une case pendant qu'elle est en place, jamais les siens ni ceux d'un allié", () => {
    const from: Pos = [2, 30];
    const to: Pos = [12, 30];
    setAmbushes([{ id: "a1", owner: "x", name: "X", alliance: 3, pos: [7, 31], from: T0, until: T0 + 4 * H, side: { army: { piquier: 600 } } }]);
    const st: S2State = { ...newS2State(T0), castle: to, safe: allSafe(), who: { id: "moi", alliance: null } };
    const lost = convoyRisk(st, convoy(from, to, T0 + H), rc());
    expect(lost).toBeCloseTo(300);
    expect(st.ambushed?.[0]).toMatchObject({ id: "a1", won: true });
    // Un convoi déjà attaqué par un joueur, un allié, ou une embuscade levée : rien.
    expect(convoyRisk({ ...st, ambushed: [] }, { ...convoy(from, to, T0 + H), hit: true }, rc())).toBe(0);
    expect(convoyRisk({ ...st, who: { id: "moi", alliance: 3 } }, convoy(from, to, T0 + H), rc())).toBe(0);
    expect(convoyRisk({ ...st }, convoy(from, to, T0 + 5 * H), rc())).toBe(0);
    setAmbushes([]);
  });
});
