import { describe, expect, it } from "vitest";
import { generateMap, type S2Map } from "./map";
import { build, buyConcession, localCap, setConcession, shipNow, concBuild, concBuildBlocker, concBuildingCost, concessionCost, supplyBlocker, takeConcessionBlocker, concessionRate, convoyLoad, firstConcessionSites, marketQuote, newS2State, REF, settleS2, stockFull, takeConcession, supplyConcession, upgradeConcession, VALUE, type S2State } from "./economy";

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
    expect(REF(0)).toBeCloseTo(1_000);
    expect(REF(3)).toBeCloseTo(4_500);
    expect(REF(7)).toBeCloseTo(6_500);
    expect(REF(14)).toBeCloseTo(9_000);
    expect(REF(5)).toBeGreaterThan(4_500);
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
    // La charge suit le niveau, pas l'atelier : un atelier poussé sans écurie déborde.
    s = { ...s, conc: s.conc.map((c) => ({ ...c, level: 15, cb: { atelier: 10 } })) };
    expect(concessionRate(s, s.conc[0], map)).toBeGreaterThan(convoyLoad(s, s.conc[0], map));
    const { s: after } = settleS2(s, ctx(), T0 + 30 * H);
    expect(stockFull(after, after.conc[0], map)).toBe(true);
  });

  it("rythme et destination par concession", () => {
    const s = start();
    const id = s.conc[0].id;
    expect(setConcession(s, id, "intensif", undefined).ok).toBe(false);
    const rich = setConcession({ ...s, gold: 1e6 }, id, "intensif", "beffroi");
    expect(rich.ok).toBe(true);
    if (!rich.ok) return;
    expect(concessionRate(rich.value, rich.value.conc[0], map)).toBeCloseTo(concessionRate(s, s.conc[0], map) * 1.25, 6);
    const { s: after, arrived } = settleS2(rich.value, ctx(), T0 + 5 * H);
    expect(arrived.pierre).toBe(0);
    expect(arrived.beffroi).toBeGreaterThan(0);
    expect(arrived.or).toBeGreaterThan(0);
    expect(after.gold).toBeLessThan(1e6);
    // Plus d'or : retour en normal au premier convoi.
    const poor = settleS2({ ...rich.value, gold: 0 }, ctx(), T0 + 2 * H).s;
    expect(poor.conc[0].pace).toBeUndefined();
    const careful = setConcession(s, id, "prudent", "chateau");
    expect(careful.ok && localCap(careful.value, careful.value.conc[0], map)).toBeCloseTo(localCap(s, s.conc[0], map) * 2 * 0.8, 6);
  });

  it("une concession envoie ses convois à la réserve d'une autre, puis au château quand elle est pleine", () => {
    const s0 = start();
    const other = map.sites.findIndex((_, id) => !takeConcessionBlocker(s0, { map, stageConcessions: 1 }, id, none));
    const two = takeConcession(s0, { map, stageConcessions: 1 }, other, none, T0);
    expect(two.ok).toBe(true);
    if (!two.ok) return;
    const [a, b] = two.value.conc;
    expect(setConcession(two.value, a.id, undefined, a.id).ok).toBe(false);
    const r = setConcession(two.value, a.id, undefined, b.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { s: after, arrived } = settleS2(r.value, ctx(), T0 + 12 * H);
    const fund = after.conc.find((x) => x.id === b.id)!.fund ?? 0;
    expect(fund).toBeGreaterThan(0);
    expect(fund).toBeLessThanOrEqual(450 + 675 + 1e-6);
    // Réserve pleine : la suite rentre au château.
    expect(arrived[map.sites[a.site].type]).toBeGreaterThan(0);
  });

  it("des brigands volent une concession restée au-dessus de 90 %, jamais en prudent ni pendant la grâce", () => {
    const s = start();
    const c = s.conc[0];
    // Une concession pleine, dont la charge ne suit pas : elle reste au plafond.
    const full = { ...s, conc: [{ ...c, stock: localCap(s, c, map) }] };
    const hurt = settleS2(full, { ...ctx(), multiplier: () => 3 }, T0 + 48 * H).s;
    const thefts = (hurt.log ?? []).filter((l) => l.text.startsWith("🗡️"));
    expect(hurt.log?.[0].text.startsWith("⚠️") || thefts.length > 0).toBe(true);
    expect(thefts.length).toBeGreaterThan(5);
    expect(thefts.length).toBeLessThan(30);
    // Même calcul en deux fois : mêmes vols.
    const mid = settleS2(full, { ...ctx(), multiplier: () => 3 }, T0 + 20 * H).s;
    const two = settleS2(mid, { ...ctx(), multiplier: () => 3 }, T0 + 48 * H).s;
    expect((two.log ?? []).filter((l) => l.text.startsWith("🗡️")).length).toBe(thefts.length);
    const safe = settleS2({ ...full, conc: [{ ...full.conc[0], pace: "prudent" as const }] }, { ...ctx(), multiplier: () => 3 }, T0 + 48 * H).s;
    expect((safe.log ?? []).some((l) => l.text.startsWith("🗡️"))).toBe(false);
    const grace = settleS2(full, { ...ctx(), multiplier: () => 3, banditsFrom: T0 + 100 * H }, T0 + 48 * H).s;
    expect((grace.log ?? []).some((l) => l.text.startsWith("🗡️"))).toBe(false);
  });

  it("en manuel, la concession garde son stock jusqu'à l'envoi", () => {
    const s = start();
    const id = s.conc[0].id;
    const m = setConcession(s, id, undefined, undefined, true);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const { s: after, arrived } = settleS2(m.value, ctx(), T0 + 3 * H);
    expect(arrived.pierre).toBe(0);
    expect(after.conc[0].stock).toBeGreaterThan(convoyLoad(s, s.conc[0], map));
    const sent = shipNow(after, id, map, T0 + 3 * H);
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.value.convoys.length).toBe(1);
    expect(sent.value.conc[0].stock).toBeCloseTo(after.conc[0].stock - convoyLoad(s, s.conc[0], map), 6);
  });

  it("bâtiments de concession : payés sur place, bornés par le niveau et le palier", () => {
    let s = start();
    const id = s.conc[0].id;
    s = { ...s, conc: s.conc.map((c) => ({ ...c, stock: 0, fund: 10_000 })) };
    expect(concBuildBlocker(s, id, "ecurie", map, T0)).toMatch(/Exploitation/);
    const r = concBuild(s, id, "atelier", map, T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.conc[0].fund).toBe(10_000 - concBuildingCost(1));
    expect(concBuildBlocker(r.value, id, "atelier", map, T0 + 1)).toMatch(/chantier/);
    const before = concessionRate(s, s.conc[0], map);
    const done = settleS2(r.value, ctx(), T0 + H).s;
    expect(done.conc[0].cb?.atelier).toBe(1);
    expect(concessionRate(done, done.conc[0], map)).toBeCloseTo(before * (1 + 0.08 / (1 + 0)), 6);
    // Niveau 2 d'atelier : il faut une concession niveau 2.
    expect(concBuildBlocker(done, id, "atelier", map, T0 + H)).toMatch(/niveau 2/);
  });

  it("améliorations, bâtiments et concessions achetées", () => {
    let s = start();
    // Rien en réserve ni en stock : il faut ravitailler la concession.
    s = { ...s, conc: s.conc.map((c) => ({ ...c, stock: 0 })) };
    expect(upgradeConcession(s, s.conc[0].id, map, T0).ok).toBe(false);
    // Plafond : le coût des deux prochains niveaux.
    const cap = concessionCost(2) + concessionCost(3);
    const have = { pierre: 1e6, fer: 1e6, or: 1e6 };
    expect(supplyBlocker(s, s.conc[0].id, have, "pierre", cap + 1)).not.toBeNull();
    expect(supplyBlocker(s, s.conc[0].id, have, "pierre", cap)).toBeNull();
    s = supplyConcession(s, s.conc[0].id, map, "pierre", 30, T0);
    expect(supplyBlocker(s, s.conc[0].id, have, "pierre", cap - 29)).not.toBeNull();
    const arrive = s.convoys[s.convoys.length - 1].arrive;
    s = settleS2(s, ctx(), arrive).s;
    expect(s.conc[0].fund).toBe(30);
    // La réserve paie d'abord, le stock local le reste.
    s = { ...s, conc: s.conc.map((c) => ({ ...c, stock: 1_000 })) };
    const up = upgradeConcession(s, s.conc[0].id, map, arrive);
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    expect(up.value.cost).toBe(concessionCost(2));
    expect(up.value.s.conc[0].fund).toBe(0);
    expect(up.value.s.conc[0].stock).toBeCloseTo(1_000 - (concessionCost(2) - 30) / VALUE[map.sites[s.conc[0].site].type], 6);
    s = up.value.s;
    const b = build(s, "outils", 1e6, arrive);
    expect(b.ok && b.value.cost).toBe(50);
    if (!b.ok) return;
    s = b.value.s;
    const later = settleS2(s, ctx(), arrive + H).s;
    expect(later.conc[0].level).toBe(2);
    expect(later.bld.outils).toBe(1);
    expect(buyConcession({ ...later, gold: 9_000 }).ok).toBe(false);
    expect(buyConcession({ ...later, gold: 10_000 }).ok).toBe(true);
  });
});
