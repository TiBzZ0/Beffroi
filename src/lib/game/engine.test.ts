import { describe, expect, it } from "vitest";
import { CLICK_PAUSE_MS, OFFLINE_CAP_MS, STAGE_MIN_SIZE } from "./config";
import {
  advance,
  applyClicks,
  buyGenerator,
  buyUpgrade,
  catchUpBonus,
  clickValue,
  contribute,
  generatorCost,
  maxAffordable,
  newPlayerState,
  productionPerSecond,
  stageSize,
  type PlayerState,
  type WorldState,
} from "./engine";
import { formatNumber } from "./format";

const T0 = 1_700_000_000_000;
const noWorld: WorldState = { stageCompletedAt: [] };

function withGenerators(gens: PlayerState["generators"], stone = 0): PlayerState {
  return { ...newPlayerState(T0), generators: gens, stone };
}

describe("calcul paresseux", () => {
  it("produit selon le temps écoulé", () => {
    const s = withGenerators({ tailleur: 2 }); // 2 × 1/s
    const after = advance(s, T0 + 10_000, noWorld);
    expect(after.stone).toBeCloseTo(20);
    expect(after.totalProduced).toBeCloseTo(20);
    expect(after.lastUpdate).toBe(T0 + 10_000);
  });

  it("plafonne les gains hors ligne à 8 h", () => {
    const s = withGenerators({ tailleur: 1 });
    const after = advance(s, T0 + 3 * OFFLINE_CAP_MS, noWorld);
    expect(after.stone).toBeCloseTo(OFFLINE_CAP_MS / 1000);
  });

  it("ne recule jamais dans le temps", () => {
    const s = withGenerators({ tailleur: 1 }, 5);
    expect(advance(s, T0 - 1000, noWorld)).toBe(s);
  });

  it("découpe le calcul quand une étape du chantier se termine pendant l'absence", () => {
    const s = withGenerators({ tailleur: 10 }); // 10/s
    const world: WorldState = { stageCompletedAt: [T0 + 5_000] }; // +10 % après 5 s
    const after = advance(s, T0 + 10_000, world);
    expect(after.stone).toBeCloseTo(50 + 55);
  });

  it("applique le bonus d'héritage", () => {
    const s = withGenerators({ tailleur: 10 });
    expect(productionPerSecond(s, { stageCompletedAt: [], legacyBonus: 0.25 }, 0)).toBeCloseTo(12.5);
  });
});

describe("achats", () => {
  it("le prix augmente de 15 % par bâtiment", () => {
    const s = withGenerators({ manoeuvre: 1 });
    expect(generatorCost(newPlayerState(T0), "manoeuvre")).toBe(15);
    expect(generatorCost(s, "manoeuvre")).toBe(Math.ceil(15 * 1.15));
  });

  it("refuse un achat trop cher", () => {
    const r = buyGenerator(withGenerators({}, 10), "manoeuvre", 1);
    expect(r.ok).toBe(false);
  });

  it("débite la pierre et ajoute le bâtiment", () => {
    const r = buyGenerator(withGenerators({}, 100), "manoeuvre", 1);
    expect(r.ok && r.value.stone).toBe(85);
    expect(r.ok && r.value.generators.manoeuvre).toBe(1);
  });

  it("calcule le maximum achetable", () => {
    const s = withGenerators({}, 1000);
    const q = maxAffordable(s, "manoeuvre");
    expect(generatorCost(s, "manoeuvre", q)).toBeLessThanOrEqual(1000);
    expect(generatorCost(s, "manoeuvre", q + 1)).toBeGreaterThan(1000);
  });

  it("refuse les quantités invalides et les bâtiments inconnus", () => {
    const s = withGenerators({}, 1e9);
    expect(buyGenerator(s, "manoeuvre", 0).ok).toBe(false);
    expect(buyGenerator(s, "manoeuvre", 1.5).ok).toBe(false);
    // @ts-expect-error identifiant inconnu
    expect(buyGenerator(s, "dragon", 1).ok).toBe(false);
  });

  it("une amélioration de bâtiment double sa production", () => {
    const s = withGenerators({ manoeuvre: 10 }, 1e6);
    const before = productionPerSecond(s, noWorld, 0);
    const r = buyUpgrade(s, "manoeuvre_1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(productionPerSecond(r.value, noWorld, 0)).toBeCloseTo(before * 2);
  });

  it("une amélioration verrouillée ou déjà achetée est refusée", () => {
    const s = withGenerators({ manoeuvre: 3 }, 1e9);
    expect(buyUpgrade(s, "manoeuvre_1").ok).toBe(false);
    const r = buyUpgrade(s, "gants_cuir");
    expect(r.ok).toBe(true);
    if (r.ok) expect(buyUpgrade(r.value, "gants_cuir").ok).toBe(false);
  });
});

describe("clics", () => {
  it("accepte au plus 20 clics par seconde", () => {
    const s = newPlayerState(T0);
    const { accepted, state } = applyClicks(s, 1_000, T0 + 2_000, noWorld);
    expect(accepted).toBe(40);
    expect(state.stone).toBe(40);
    expect(state.lastClickAt).toBe(T0 + 2_000);
  });

  it("plafonne la fenêtre à 10 s pour éviter le crédit de clics", () => {
    const { accepted } = applyClicks(newPlayerState(T0), 100_000, T0 + 3_600_000, noWorld);
    expect(accepted).toBe(200);
  });

  it("un lot honnête envoyé après une coupure ne compte pas d'avertissement", () => {
    const r = applyClicks({ ...newPlayerState(T0), clickStrikes: 4 }, 600, T0 + 60_000, noWorld);
    expect(r.paused).toBe(false);
    expect(r.state.clickStrikes).toBe(3);
  });

  it("un humain rapide, même avec un envoi en retard, n'est jamais confisqué", () => {
    let s = newPlayerState(T0);
    let t = T0;
    for (let i = 0; i < 20; i++) {
      t += i % 2 ? 1_000 : 5_000; // envois irréguliers, 15 coups/s en moyenne
      const r = applyClicks(s, i % 2 ? 15 : 75, t, noWorld);
      expect(r.paused).toBe(false);
      s = r.state;
    }
  });

  it("confisque le marteau après 5 envois de suite à une cadence surhumaine", () => {
    let s = newPlayerState(T0);
    let t = T0;
    for (let i = 0; i < 4; i++) {
      t += 6_000;
      const r = applyClicks(s, 480, t, noWorld); // 80 coups/s
      expect(r.paused).toBe(false);
      s = r.state;
    }
    t += 6_000;
    const r = applyClicks(s, 480, t, noWorld);
    expect(r).toMatchObject({ paused: true, accepted: 0 });
    expect(r.state.clickPausedUntil).toBe(t + CLICK_PAUSE_MS);
    // Pendant la pause, plus rien n'est compté ; ensuite tout repart.
    expect(applyClicks(r.state, 10, t + 60_000, noWorld).accepted).toBe(0);
    expect(applyClicks({ ...r.state, lastClickAt: t + CLICK_PAUSE_MS }, 10, t + CLICK_PAUSE_MS + 3_000, noWorld).accepted).toBe(10);
  });

  it("une cadence humaine efface peu à peu les avertissements", () => {
    let s = { ...newPlayerState(T0), clickStrikes: 2 };
    s = applyClicks(s, 60, T0 + 6_000, noWorld).state; // 10 coups/s
    expect(s.clickStrikes).toBe(1);
  });

  it("ignore les valeurs absurdes", () => {
    expect(applyClicks(newPlayerState(T0), -5, T0 + 1000, noWorld).accepted).toBe(0);
    expect(applyClicks(newPlayerState(T0), Number.NaN, T0 + 1000, noWorld).accepted).toBe(0);
  });

  it("les bonus de clic se cumulent", () => {
    const s = { ...withGenerators({ tailleur: 10 }), upgrades: ["gants_cuir", "marteau_maitre"] };
    // 1 × 2 (gants) × 2 (étape 2) ; le marteau de maître ne touche plus le coup.
    expect(clickValue(s, noWorld, 2)).toBeCloseTo(4);
  });

  it("frapper donne de l'élan : +20 % de production pendant 1 s par coup, 30 s au plus", () => {
    const s = { ...withGenerators({ tailleur: 10 }), upgrades: ["marteau_maitre"] };
    const hit = applyClicks(s, 100, T0 + 10_000, noWorld).state;
    expect(hit.elanUntil).toBe(T0 + 10_000 + 30_000);
    const base = advance({ ...s, lastUpdate: T0 + 10_000 }, T0 + 70_000, noWorld).stone - s.stone;
    const boosted = advance({ ...hit, lastUpdate: T0 + 10_000 }, T0 + 70_000, noWorld).stone - hit.stone;
    // 30 s à +20 % sur 60 s : +10 %.
    expect(boosted / base).toBeCloseTo(1.1);
  });
});

describe("chantier commun", () => {
  it("la contribution ne peut dépasser le stock", () => {
    const r = contribute(withGenerators({}, 42.7), 1000);
    expect(r.ok && r.value.stone).toBeCloseTo(0.7);
    expect(r.ok && r.value.totalContributed).toBe(42);
  });

  it("refuse une contribution nulle", () => {
    expect(contribute(withGenerators({}, 0.5), 10).ok).toBe(false);
    expect(contribute(withGenerators({}, 50), 0).ok).toBe(false);
  });

  it("une étape vaut 4 h de la production cumulée des joueurs actifs", () => {
    expect(stageSize([1000, 500])).toBe(1500 * 4 * 3600);
    expect(stageSize([])).toBe(STAGE_MIN_SIZE);
    expect(stageSize([Number.NaN, -3, 1])).toBe(STAGE_MIN_SIZE);
  });
});

describe("coup de pouce aux joueurs distancés", () => {
  it("rien tant que l'écart reste faible", () => {
    expect(catchUpBonus(1000, 1000)).toBe(0);
    expect(catchUpBonus(1000, 1900)).toBe(0);
  });

  it("grandit avec l'écart, plafonné", () => {
    expect(catchUpBonus(1000, 10_000)).toBeCloseTo(0.3);
    expect(catchUpBonus(1000, 100_000)).toBeCloseTo(0.6);
    expect(catchUpBonus(1, 1e12)).toBe(0.8);
    expect(catchUpBonus(0, 0)).toBe(0);
  });

  it("augmente la production", () => {
    const base = withGenerators({ manoeuvre: 10 });
    expect(productionPerSecond({ ...base, catchUp: 0.5 }, noWorld, 0)).toBeCloseTo(productionPerSecond(base, noWorld, 0) * 1.5);
  });
});

describe("format", () => {
  it("formate à la française", () => {
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(12_345).replace(/\s/g, " ")).toBe("12 345");
    expect(formatNumber(1_234_567)).toBe("1,23 M");
    expect(formatNumber(4.2e9)).toBe("4,20 Md");
  });
});
