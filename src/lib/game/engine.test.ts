import { describe, expect, it } from "vitest";
import { CLICK_PAUSE_MS, OFFLINE_CAP_MS, STAGE_MIN_SIZE } from "./config";
import {
  advance,
  generatorRate,
  masteryBonus,
  nextTiers,
  applyClicks,
  buyGenerator,
  buyUpgrade,
  catchUpBonus,
  clickValue,
  contribute,
  generatorCost,
  maxAffordable,
  newPlayerState,
  payTithe,
  stagePerk,
  claimQuest,
  scheduleVein,
  catchVein,
  inCurfew,
  setCurfew,
  openShare,
  recordGift,
  setTithe,
  productionPerSecond,
  raidBlocker,
  sabotageBlocker,
  stageSize,
  type PlayerState,
  type WorldState,
} from "./engine";
import { formatNumber, formatRate } from "./format";

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

  it("frapper donne de l'élan : +20 % de production pendant 3 s par coup, 10 min au plus", () => {
    const s = { ...withGenerators({ tailleur: 10 }), upgrades: ["marteau_maitre"] };
    const hit = applyClicks(s, 100, T0 + 10_000, noWorld).state;
    expect(hit.elanUntil).toBe(T0 + 10_000 + 300_000);
    const base = advance({ ...s, lastUpdate: T0 + 10_000 }, T0 + 610_000, noWorld).stone - s.stone;
    const boosted = advance({ ...hit, lastUpdate: T0 + 10_000 }, T0 + 610_000, noWorld).stone - hit.stone;
    // 5 min à +20 % sur 10 min : +10 %.
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

describe("dîme automatique", () => {
  it("prélève sa part de la production passive pour le chantier", () => {
    const s = { ...withGenerators({ tailleur: 10 }), tithe: 0.1 }; // 10/s
    const after = advance(s, T0 + 10_000, noWorld);
    expect(after.stone).toBeCloseTo(90);
    expect(after.titheOwed).toBeCloseTo(10);
    expect(after.totalProduced).toBeCloseTo(100);
    const paid = payTithe(after);
    expect(paid.paid).toBe(10);
    expect(paid.state.totalContributed).toBe(10);
  });

  it("continue après le beffroi achevé, pour les embellissements (G1)", () => {
    const s = { ...withGenerators({ tailleur: 10 }), tithe: 0.2 };
    const done: WorldState = { stageCompletedAt: Array.from({ length: 8 }, () => T0 - 1) };
    expect(advance(s, T0 + 10_000, done).titheOwed).toBeGreaterThan(0);
  });

  it("se règle de 0 à 20 % par pas de 1 %", () => {
    const s = newPlayerState(T0);
    expect(setTithe(s, 12).ok && setTithe(s, 12)).toMatchObject({ value: { tithe: 0.12, titheSet: true } });
    expect(setTithe(s, 21).ok).toBe(false);
    expect(setTithe(s, 2.5).ok).toBe(false);
  });
});

describe("paliers de don", () => {
  it("la part vaut 4 h de production, mesurée à l'ouverture de l'étape", () => {
    const s = openShare(withGenerators({ tailleur: 10 }), 2, noWorld, T0);
    expect(s.share).toEqual({ stage: 2, size: 10 * 4 * 3600, given: 0, tiers: 0 });
    expect(openShare(withGenerators({ tailleur: 99 }), 2, noWorld, T0).share?.size).not.toBe(s.share?.size);
    expect(openShare(s, 2, noWorld, T0 + 1)).toBe(s);
  });

  it("25, 50 et 100 % versés : +2 % de production et 5, 10, 15 écus", () => {
    const s = openShare(withGenerators({ tailleur: 10 }), 0, noWorld, T0);
    const size = s.share!.size;
    const a = recordGift(s, size * 0.3);
    expect(a).toMatchObject({ tiers: 1, ecus: 5 });
    const b = recordGift(a.state, size);
    expect(b).toMatchObject({ tiers: 2, ecus: 25 });
    expect(b.state.donorTiers).toBe(3);
    expect(recordGift(b.state, size).tiers).toBe(0);
    expect(productionPerSecond(b.state, noWorld, 0)).toBeCloseTo(10 * 1.06);
  });

  it("Q4 : 10, 25 et 50 % sur les étapes de 12 h et plus, rattrapés sans nouveau don", () => {
    const s = openShare(withGenerators({ tailleur: 10 }), 8, noWorld, T0);
    const size = s.share!.size;
    expect(recordGift(s, size * 0.12)).toMatchObject({ tiers: 1, ecus: 5 });
    const old = { ...s, share: { ...s.share!, given: size * 0.3, tiers: 1 } };
    expect(recordGift(old, 0)).toMatchObject({ tiers: 1, ecus: 10 });
    const short = openShare(withGenerators({ tailleur: 10 }), 0, noWorld, T0);
    expect(recordGift(short, short.share!.size * 0.12).tiers).toBe(0);
  });
});

describe("couvre-feu", () => {
  const DAY = 86_400_000;
  const midnight = Math.floor(T0 / DAY) * DAY + 10 * DAY;

  it("une plage choisie prend effet 24 h plus tard, puis couvre 8 h par jour", () => {
    const r = setCurfew(newPlayerState(midnight), 22 * 60, midnight); // 22 h à 6 h UTC
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(inCurfew(r.value, midnight + 23 * 3_600_000)).toBe(false); // pas encore en vigueur
    expect(inCurfew(r.value, midnight + DAY + 23 * 3_600_000)).toBe(true);
    expect(inCurfew(r.value, midnight + 2 * DAY + 5 * 3_600_000)).toBe(true);
    expect(inCurfew(r.value, midnight + 2 * DAY + 6 * 3_600_000)).toBe(false);
  });

  it("bloque les raids et les sabotages dans les deux sens", () => {
    const sleeper = { ...newPlayerState(midnight), curfew: { start: 0 }, academy: 3 };
    const raider = { ...newPlayerState(midnight), troops: { milicien: 10 } };
    const at = midnight + 3_600_000;
    const ctx = { now: at, attackerId: "a", victimId: "b", victimRate: 1 };
    expect(raidBlocker(raider, sleeper, ctx)).toMatch(/couvre-feu/);
    expect(raidBlocker({ ...raider, curfew: { start: 0 } }, newPlayerState(midnight), ctx)).toMatch(/couvre-feu/);
    expect(sabotageBlocker(sleeper, at, raider)).toMatch(/couvre-feu/);
  });

  it("refuse une plage invalide", () => {
    expect(setCurfew(newPlayerState(0), 1440, 0).ok).toBe(false);
    expect(setCurfew(newPlayerState(0), 12.5, 0).ok).toBe(false);
  });
});

describe("veines d'or", () => {
  it("apparaît entre 5 et 10 minutes plus tard, puis se reprogramme une fois passée", () => {
    const s = scheduleVein(newPlayerState(T0), T0, () => 0.5);
    expect(s.veinAt).toBe(T0 + 450_000);
    expect(scheduleVein(s, T0 + 100_000)).toBe(s);
    expect(scheduleVein(s, T0 + 470_000, () => 0).veinAt).toBe(T0 + 470_000 + 300_000);
  });

  it("frénésie : production doublée pendant 30 s", () => {
    const s = advance({ ...withGenerators({ tailleur: 10 }), veinAt: T0 }, T0 + 1_000, noWorld);
    const r = catchVein(s, T0 + 1_000, noWorld, () => 0.1);
    expect(r.ok && r.value.outcome.kind).toBe("frenzy");
    if (!r.ok) return;
    const after = advance(r.value.state, T0 + 61_000, noWorld);
    expect(after.stone).toBeCloseTo(10 * 61 + 10 * 30);
  });

  it("pluie : 3 minutes de production d'un coup", () => {
    const s = { ...withGenerators({ tailleur: 10 }), veinAt: T0 };
    const r = catchVein(s, T0, noWorld, () => 0.9);
    expect(r.ok && r.value.state.stone).toBeCloseTo(1800);
  });

  it("refuse une veine refermée ou pas encore là", () => {
    const s = { ...withGenerators({ tailleur: 10 }), veinAt: T0 };
    expect(catchVein(s, T0 + 20_000, noWorld).ok).toBe(false);
    expect(catchVein(s, T0 - 10_000, noWorld).ok).toBe(false);
    expect(catchVein(newPlayerState(T0), T0, noWorld).ok).toBe(false);
  });
});

describe("accueil guidé", () => {
  it("valide une quête remplie, récompense 5 min de production (100 au moins) et passe à la suivante", () => {
    const s = { ...newPlayerState(T0), quest: 0, totalClicks: 19 };
    expect(claimQuest(s, noWorld, T0).done).toBeNull();
    const r = claimQuest({ ...s, totalClicks: 20 }, noWorld, T0);
    expect(r.done).toBe(0);
    expect(r.state.quest).toBe(1);
    expect(r.state.stone).toBe(100);
  });

  it("la dîme réglée remplit sa quête, la dernière donne 5 écus, un ancien compte n'a rien", () => {
    const s = { ...withGenerators({ tailleur: 10 }), quest: 4 };
    const t = setTithe(s, 10);
    expect(t.ok && claimQuest(t.value, noWorld, T0).state.stone).toBe(3000);
    expect(claimQuest({ ...s, quest: 9, questFlags: ["push"] }, noWorld, T0).ecus).toBe(5);
    expect(claimQuest({ ...s, quest: null, totalClicks: 99 }, noWorld, T0).done).toBeNull();
  });
});

describe("lots du chantier", () => {
  it("prime de lot : +10 % jusqu'à la fin de l'étape suivante", () => {
    const s = { ...withGenerators({ tailleur: 10 }), lotBonusUntilStage: 2 };
    expect(productionPerSecond(s, noWorld, 1)).toBeCloseTo(10 * 1.1 * 1.1); // étape 1 finie : +10 % d'étape
    expect(productionPerSecond(s, noWorld, 2)).toBeCloseTo(productionPerSecond({ ...s, lotBonusUntilStage: 0 }, noWorld, 2));
  });

  it("maître d'œuvre : +15 % de production pendant 24 h", () => {
    const s = { ...withGenerators({ tailleur: 10 }), masterBonuses: [{ kind: "production" as const, from: T0 + 10_000, until: T0 + 20_000 }] };
    expect(advance(s, T0 + 30_000, noWorld).stone).toBeCloseTo(300 + 10 * 10 * 0.15);
  });
});

describe("bonus d'étape variés", () => {
  it("se cumulent selon les étapes achevées", () => {
    expect(stagePerk(3, "defenseHp")).toBe(0);
    expect(stagePerk(4, "defenseHp")).toBeCloseTo(0.2);
    expect(stagePerk(5, "elan")).toBeCloseTo(0.25);
    expect(stagePerk(6, "securedSeconds")).toBe(3600);
    expect(stagePerk(8, "researchSpeed")).toBeCloseTo(0.2);
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
    expect(formatNumber(1_234_567).replace(/\s/g, " ")).toBe("1,23 M");
    expect(formatNumber(4.2e9).replace(/\s/g, " ")).toBe("4,20 Md");
    expect(formatRate(11_583).replace(/\s/g, " ")).toBe("11,6 k");
  });
});

describe("durée des étapes", () => {
  it("l'horloge vaut 12 h et le beffroi légendaire 24 h de production", async () => {
    const { stageSize: size } = await import("./engine");
    const { stageHours } = await import("./config");
    expect(stageHours(5)).toBe(4);
    expect(stageHours(6)).toBe(12);
    expect(stageHours(7)).toBe(24);
    expect(size([1e6], stageHours(6))).toBe(3 * size([1e6], stageHours(5)));
  });
});

describe("corps de métier et compagnonnage", () => {
  const base = (generators: Partial<Record<import("./config").GeneratorId, number>>, ruins = {}) => ({ ...newPlayerState(0), generators, ruins });
  it("donne +2 % par tranche complète de 50, ruines exclues", () => {
    expect(masteryBonus(base({ manoeuvre: 49 }))).toBe(0);
    expect(masteryBonus(base({ manoeuvre: 100, tailleur: 50 }))).toBeCloseTo(0.06);
    expect(masteryBonus(base({ manoeuvre: 45 }, { manoeuvre: 10 }))).toBe(0);
  });
  it("donne +1 % au grand bâtiment par tranche de 10 du petit", () => {
    expect(generatorRate(base({ manoeuvre: 25 }), "merveille")).toBeCloseTo(430_000_000 * 1.02);
    expect(generatorRate(base({ manoeuvre: 25 }), "manoeuvre")).toBeCloseTo(0.1);
    const t = nextTiers(base({ manoeuvre: 25 }), "manoeuvre");
    expect(t.mastery.missing).toBe(25);
    expect(t.companion).toEqual({ missing: 5, bonus: 0.01, target: "merveille" });
    expect(nextTiers(base({}), "merveille").companion).toBeNull();
    expect(nextTiers(base({}), "guilde").companion?.target).toBe("cathedrale");
  });
});

describe("R6 : bonus de maître d'œuvre", () => {
  it("un second bonus du même genre allonge le premier, un autre genre s'ajoute à côté", async () => {
    const { chainMasterBonuses } = await import("./engine");
    const H = 3_600_000;
    const out = chainMasterBonuses([
      { kind: "production", from: 0, until: 24 * H },
      { kind: "production", from: 10 * H, until: 34 * H },
      { kind: "loot", from: 5 * H, until: 29 * H },
    ]);
    expect(out).toEqual([
      { kind: "production", from: 0, until: 48 * H },
      { kind: "loot", from: 5 * H, until: 29 * H },
    ]);
  });
});

describe("G1 : embellissements", () => {
  it("le chantier continue après le beffroi, +5 % de production par embellissement", async () => {
    const { stageDef, embellishmentOf, stageHours, STAGES, TOTAL_STAGES } = await import("./config");
    expect(stageDef(8).name).toBe("Les vitraux");
    expect(stageDef(13).name).toBe("Embellissement 6");
    expect(embellishmentOf(7)).toBe(0);
    expect(embellishmentOf(9)).toBe(2);
    expect(stageHours(10)).toBe(24);
    expect(TOTAL_STAGES).toBeGreaterThan(STAGES.length + 50);
    const s = withGenerators({ tailleur: 10 });
    const at = (n: number) => productionPerSecond(s, { stageCompletedAt: Array.from({ length: n }, () => 0) }, n);
    expect(at(11) / at(8)).toBeCloseTo(1.15);
  });
});

describe("U2 : boîte de réception", () => {
  it("marque lue une catégorie ou toutes, refuse une catégorie inconnue", async () => {
    const { markInboxRead, newPlayerState: fresh } = await import("./engine");
    const s = fresh(0);
    const one = markInboxRead(s, "combats", 10);
    expect(one.ok && one.value.inboxRead).toEqual({ combats: 10 });
    const all = markInboxRead(s, "all", 20);
    expect(all.ok && Object.keys(all.value.inboxRead ?? {}).length).toBe(5);
    expect(markInboxRead(s, "rien", 1).ok).toBe(false);
  });
});
