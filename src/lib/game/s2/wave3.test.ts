import { afterEach, describe, expect, it } from "vitest";
import { MAP, useS2 } from "./fixture";
import { convoyRisk, setCamps, type RouteContext } from "./convoys";
import { newS2State, type Convoy, type S2State } from "./economy";
import type { Pos } from "./map";
import { convoyVisible, interceptBlocker, lossesBeyondTower, setTradeOffer, tradePay, watchPoints, withTower } from "./players";
import { NODES, BRANCHES } from "../lineage";
import { MERC_ARMY, mercBlocker } from "./mercs";

const T0 = Date.parse("2026-12-07T15:00:00Z");
const H = 3_600_000;
const convoy = (from: Pos, to: Pos, depart: number, load = 900): Convoy => ({ conc: "c1", res: "pierre", load, depart, arrive: depart + 30 * 60_000, from, to });
const rc = (): RouteContext => ({ map: MAP, seasonStart: T0, stagesDone: 0, escort: () => null, hurt: () => {} });
const allSafe = (): Record<string, number> => Object.fromEntries(MAP.lords.map((l) => [l.id, T0 + 999 * H]));
const rel = { allied: false, sameIp: false, newbieUntil: 0 };

afterEach(() => setCamps([]));

describe("Vague C : tours de site", () => {
  useS2();
  it("chaque niveau de tour ajoute une case de vue autour du site", () => {
    const site = MAP.sites[0];
    const s: S2State = { ...newS2State(T0), castle: [0, 0], conc: [{ id: "c1", site: 0, level: 3, stock: 0, next: T0, cb: { tour: 3 } }] };
    const pts = watchPoints(s, MAP);
    expect(pts[1]).toEqual([site.pos[0], site.pos[1], 3]);
    const far: Pos = [site.pos[0] + 7, site.pos[1]];
    expect(convoyVisible([[site.pos[0], site.pos[1], 0]], 5, far)).toBe(false);
    expect(convoyVisible([[site.pos[0], site.pos[1], 3]], 5, far)).toBe(true);
  });

  it("les gardes de la tour se joignent à l'escorte, et leurs pertes ne touchent pas l'escorte", () => {
    expect(withTower(null, 0)).toBeNull();
    const alone = withTower(null, 2)!.army as Record<string, number>;
    expect(alone).toEqual({ piquier: 400, arbaletrier: 300 });
    const mixed = withTower({ army: { arbaletrier: 150 } as never, levels: { arbaletrier: 2 } }, 1)!;
    expect((mixed.army as Record<string, number>).arbaletrier).toBe(300);
    const dead = lossesBeyondTower({ arbaletrier: 100, piquier: 50 } as never, mixed, 1) as Record<string, number>;
    expect(dead).toEqual({ arbaletrier: 50, piquier: 0 });
  });
});

describe("Vague C : Lignée du Marchand", () => {
  useS2();
  it("une quatrième branche de six nœuds, un seul de rang 4", () => {
    expect(BRANCHES.map((b) => b.id)).toContain("marchand");
    const m = NODES.filter((n) => n.branch === "marchand");
    expect(m).toHaveLength(6);
    expect(m.filter((n) => n.rank === 4)).toHaveLength(1);
  });

  it("Comptoirs : une route de plus ; Marchandage : plus d'or par convoi", () => {
    let s: S2State = { ...newS2State(T0), castle: [5, 5] };
    for (const to of ["a", "b", "c"]) s = (setTradeOffer(s, to, true, T0) as { value: S2State }).value;
    expect(setTradeOffer(s, "d", true, T0).ok).toBe(false);
    expect(setTradeOffer(s, "d", true, T0, undefined, 4).ok).toBe(true);
    const base = tradePay(s, [5, 5], [15, 5], T0, T0);
    expect(tradePay({ ...s, tradeBonus: 0.2 }, [5, 5], [15, 5], T0, T0)).toBeCloseTo(base * 1.2);
  });

  it("Grand marchand : ses convois de commerce ne peuvent pas être attaqués", () => {
    const target: S2State = { ...newS2State(T0), castle: [5, 5], tradeSafe: true };
    const v: Convoy = { ...convoy([5, 5], [15, 5], T0), conc: "trade:x" };
    expect(interceptBlocker(target, v, rel, T0 + 60_000)).toMatch(/Grand marchand/);
    expect(interceptBlocker(target, { ...v, conc: "c1" }, rel, T0 + 60_000)).toBeNull();
  });

  it("Architecte royal : le premier convoi du jour qui devait perdre arrive intact, pas le suivant", () => {
    const from: Pos = [2, 30];
    const to: Pos = [12, 30];
    setCamps([{ id: "k1", pos: [7, 31], from: T0 }]);
    // Trouve deux convois que le camp attaque.
    const hits: number[] = [];
    for (let i = 0; i < 60 && hits.length < 2; i++) {
      const st = { ...newS2State(T0), castle: to, safe: allSafe() };
      if (convoyRisk(st, convoy(from, to, T0 + i * 7 * 60_000), rc()) > 0) hits.push(i);
    }
    expect(hits).toHaveLength(2);
    const st: S2State = { ...newS2State(T0), castle: to, safe: allSafe(), archShield: true };
    expect(convoyRisk(st, convoy(from, to, T0 + hits[0] * 7 * 60_000), rc())).toBe(0);
    expect(st.archDay).toBeGreaterThan(0);
    expect(convoyRisk(st, convoy(from, to, T0 + hits[1] * 7 * 60_000), rc())).toBeGreaterThan(0);
  });
});

describe("Vague C : mercenaires avec l'armée, passage libre des forteresses", () => {
  useS2();
  it("des mercenaires peuvent être loués pour l'armée, une seule compagnie à la fois", () => {
    const lord = MAP.lords[0];
    const s: S2State = { ...newS2State(T0), castle: [5, 5], gold: 1e9, safe: allSafe() };
    expect(mercBlocker(s, lord, MERC_ARMY, 10, T0)).toBeNull();
    const hired: S2State = { ...s, mercs: [{ lord: MAP.lords[1].id, unit: "milicien", men: 1000, train: 1, until: T0 + H, conc: MERC_ARMY }] };
    expect(mercBlocker(hired, lord, MERC_ARMY, 10, T0)).toMatch(/armée/);
  });

  it("à 4 cases d'une forteresse tenue par l'alliance, un camp n'attaque pas", () => {
    const from: Pos = [2, 30];
    const to: Pos = [12, 30];
    setCamps([{ id: "k1", pos: [7, 31], from: T0 }]);
    let open = 0;
    let shel = 0;
    for (let i = 0; i < 60; i++) {
      if (convoyRisk({ ...newS2State(T0), castle: to, safe: allSafe() }, convoy(from, to, T0 + i * 7 * 60_000), rc()) > 0) open++;
      if (convoyRisk({ ...newS2State(T0), castle: to, safe: allSafe(), safeZones: [[7, 28]] }, convoy(from, to, T0 + i * 7 * 60_000), rc()) > 0) shel++;
    }
    expect(open).toBeGreaterThan(0);
    expect(shel).toBe(0);
  });
});

describe("Équilibrage : hostilité d'un hobereau", () => {
  useS2();
  it("chaque passage d'heure en heure s'additionne, même petit", async () => {
    const { addHostility, hostilityAt, HOSTILITY } = await import("./convoys");
    const l = MAP.lords.find((x) => x.rank === "hobereau")!;
    const st = { ...newS2State(T0), castle: [0, 0] as Pos };
    addHostility(st, MAP, l, HOSTILITY.cross, T0);
    addHostility(st, MAP, l, HOSTILITY.cross, T0 + H);
    expect(hostilityAt(st, l.id, T0 + H)).toBeGreaterThan(0.8);
  });
});
