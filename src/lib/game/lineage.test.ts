import { describe, expect, it } from "vitest";
import { battle, seededRng } from "./battle";
import { donorThresholds, extraSecured, newPlayerState, productionPerSecond, sabotageCost, spyTravelMs, type PlayerState } from "./engine";
import { s2Player, useS2 } from "./s2/fixture";
import { buyNode, lineageMark, nodeBlocker, parisDay, renownAvailable, respec, respecBlocker, type LineageState } from "./lineage";

const world = { stageCompletedAt: [] };
const withNodes = (nodes: string[], extra: Partial<PlayerState> = {}): PlayerState => ({ ...newPlayerState(0), lineage: { nodes, fees: 0, respecAt: 0 }, ...extra });

describe("Lignée : achats", () => {
  it("un nœud de rang 1 se prend avec 3 renom", () => {
    const r = buyNode(newPlayerState(0), "carriere", 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.lineage?.nodes).toEqual(["carriere"]);
    expect(buyNode(newPlayerState(0), "carriere", 2).ok).toBe(false);
  });

  it("le rang 2 demande 6 renom dépensés dans la branche", () => {
    const one = withNodes(["carriere"]);
    expect(nodeBlocker(one.lineage, "dime", 100)).toMatch(/6 renom/);
    const two = withNodes(["carriere", "cave"]);
    expect(nodeBlocker(two.lineage, "dime", 100)).toBeNull();
    // Dépenser dans une autre branche ne compte pas.
    expect(nodeBlocker(withNodes(["carriere", "forge"]).lineage, "dime", 100)).not.toBeNull();
  });

  it("un seul nœud de rang 4 dans toute la Lignée", () => {
    const l: LineageState = { nodes: ["carriere", "cave", "main_oeuvre", "dime", "savants", "charpentiers", "fondations", "marteau", "architecte", "forge", "marche", "recrues", "pillard", "chirurgiens", "rancune", "beliers", "veterans"], fees: 0, respecAt: 0 };
    expect(nodeBlocker(l, "chef", 100)).toMatch(/rang 4/);
    expect(lineageMark(l)).toBe("⛏️");
  });

  it("changer de voie rend tout sauf 10, une fois par jour", () => {
    const s = withNodes(["carriere", "cave", "dime", "main_oeuvre"]);
    expect(renownAvailable(40, s.lineage)).toBe(40 - 15);
    const now = Date.parse("2026-11-14T10:00:00Z");
    const r = respec(s, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(renownAvailable(40, r.value.lineage)).toBe(30);
    expect(respecBlocker({ ...r.value.lineage!, nodes: ["carriere", "cave", "main_oeuvre", "forge"] }, now + 3_600_000)).toMatch(/fois par jour/);
    expect(respecBlocker({ ...r.value.lineage!, nodes: ["carriere", "cave", "main_oeuvre", "forge"] }, now + 86_400_000)).toBeNull();
  });

  it("le jour se compte à l'heure de Paris", () => {
    expect(parisDay(Date.parse("2026-11-14T22:30:00Z"))).toBe("2026-11-14");
    expect(parisDay(Date.parse("2026-11-14T23:30:00Z"))).toBe("2026-11-15");
  });
});

describe("Lignée : effets", () => {
  useS2();
  it("Bâtisseur", () => {
    const base = s2Player(0);
    const has = (ids: string[]) => ({ ...base, lineage: { nodes: ids, fees: 0, respecAt: 0 } });
    expect(productionPerSecond(has(["carriere"]), world, 0)).toBeGreaterThan(productionPerSecond(base, world, 0));
    expect(extraSecured(has(["cave"])) - extraSecured(base)).toBe(1800);
    expect(donorThresholds(has(["dime"]), 0)[0]).toBeCloseTo(donorThresholds(base, 0)[0] * 0.8);
  });

  it("Maître espion", () => {
    expect(spyTravelMs(10, true)).toBeLessThan(spyTravelMs(10));
    const rich = s2Player(0);
    expect(sabotageCost({ ...rich, lineage: { nodes: ["poudre"], fees: 0, respecAt: 0 } }, rich, world, 0)).toBeLessThan(sabotageCost(rich, rich, world, 0));
  });

  it("Vétérans : moins de pertes ; Chef de guerre : fortune bornée", () => {
    const att = { chevalier: 200 };
    const def = { piquier: 300 };
    let plain = 0;
    let vet = 0;
    for (let i = 0; i < 40; i++) {
      plain += battle(att, def, seededRng(i), { fortune: true }).attackerLost.chevalier ?? 0;
      vet += battle(att, def, seededRng(i), { fortune: true, attackerLosses: 0.9 }).attackerLost.chevalier ?? 0;
    }
    expect(vet).toBeLessThan(plain);
    // Une fortune à 0,95 minimum ne descend jamais aussi bas qu'une fortune à 0,8.
    const low = battle(att, def, () => 0, { fortune: { min: 0.95, max: 1.25 } });
    const lower = battle(att, def, () => 0, { fortune: true });
    expect((low.defenderLost.piquier ?? 0)).toBeGreaterThanOrEqual(lower.defenderLost.piquier ?? 0);
  });
});
