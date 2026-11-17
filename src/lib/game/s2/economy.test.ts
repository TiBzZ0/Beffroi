import { describe, expect, it } from "vitest";
import { generateMap, type S2Map } from "./map";
import { build, buyConcession, concessionRate, convoyLoad, firstConcessionSites, marketQuote, newS2State, REF, settleS2, stockFull, takeConcession, upgradeConcession, type S2State } from "./economy";

const T0 = Date.parse("2026-12-07T15:00:00Z");
const H = 3_600_000;
let map: S2Map;
const ctx = () => ({ map, stageConcessions: 0 });
const none = { taken: () => 0 };
function start(): S2State {
  map ??= generateMap(1);
  const castle: [number, number] = [2, 2];
  let s: S2State = { ...newS2State(T0), castle };
  const site = firstConcessionSites(map, castle, () => 0)[0];
  const r = takeConcession(s, ctx(), site, none, T0);
  if (!r.ok) throw new Error(r.error);
  s = r.value;
  return s;
}

describe("S2 : économie", () => {
  it("REF suit les points de la spécification", () => {
    expect(REF(0)).toBeCloseTo(100);
    expect(REF(3)).toBeCloseTo(400);
    expect(REF(7)).toBeCloseTo(1200);
    expect(REF(14)).toBeCloseTo(3000);
    expect(REF(5)).toBeGreaterThan(400);
  });

  it("le marché rend le tiers de la valeur", () => {
    expect(marketQuote("pierre", "or", 300)).toBe(25);
    expect(marketQuote("or", "fer", 3)).toBe(2);
  });

  it("une concession remplit des convois qui arrivent au château, avec 3 % d'or en plus", () => {
    const s = start();
    const c = s.conc[0];
    const rate = concessionRate(s, c, map);
    const { s: after, arrived } = settleS2(s, ctx(), T0 + 10 * H);
    const inFlight = after.convoys.reduce((a, v) => a + v.load, 0);
    // Tout ce qui a été produit (plus la première charge offerte) est au château, en route, ou dans le stock local.
    expect(arrived.pierre + inFlight + after.conc[0].stock).toBeCloseTo(rate * 10 + c.stock, 3);
    expect(c.next).toBe(s.at);
    expect(arrived.pierre).toBeGreaterThan(rate * 8);
    expect(arrived.or).toBeCloseTo((arrived.pierre * 0.03) / 4, 6);
    // Calcul paresseux : deux pas ou un seul, même résultat.
    const mid = settleS2(s, ctx(), T0 + 4 * H);
    const end = settleS2(mid.s, ctx(), T0 + 10 * H);
    expect(mid.arrived.pierre + end.arrived.pierre).toBeCloseTo(arrived.pierre, 6);
  });

  it("une concession trop productive pour sa charge remplit son stock et s'arrête", () => {
    let s = start();
    s = { ...s, conc: s.conc.map((c) => ({ ...c, level: 15 })) };
    expect(concessionRate(s, s.conc[0], map)).toBeGreaterThan(convoyLoad(s, s.conc[0], map));
    const { s: after } = settleS2(s, ctx(), T0 + 30 * H);
    expect(stockFull(after, after.conc[0], map)).toBe(true);
  });

  it("améliorations, bâtiments et concessions achetées", () => {
    let s = start();
    const up = upgradeConcession(s, s.conc[0].id, 1e6, T0);
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    expect(up.value.cost).toBe(450);
    s = up.value.s;
    const b = build(s, "outils", 1e6, T0);
    expect(b.ok && b.value.cost).toBe(500);
    if (!b.ok) return;
    s = b.value.s;
    const later = settleS2(s, ctx(), T0 + H).s;
    expect(later.conc[0].level).toBe(2);
    expect(later.bld.outils).toBe(1);
    expect(buyConcession({ ...later, gold: 1_000 }).ok).toBe(false);
    expect(buyConcession({ ...later, gold: 1_500 }).ok).toBe(true);
  });
});
