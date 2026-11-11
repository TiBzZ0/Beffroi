import { describe, expect, it } from "vitest";
import { BURN_MS, GUARDS_PER_DOMAIN, INFIRMARY_MS, LORD_SHIELD_MS, RAID_COOLDOWN_MS, SECURED_SECONDS, SHIELD_MS } from "./config";
import { armyFromBudget, battle, estimateChance, seededRng } from "./battle";
import {
  settleWounded,
  fairness,
  advance,
  applyClicks,
  armyWorth,
  buyArmy,
  defenseArmy,
  fuzzyArmy,
  fuzzyCount,
  generatorCost,
  spyCost,
  spyRisk,
  spyTravelMs,
  sabotageChance,
  rumorArmy,
  lootOf,
  buyCounter,
  buyRumor,
  counterActive,
  applySabotage,
  sabotageBlocker,
  researchCost,
  startResearch,
  newPlayerState,
  rebuildRuin,
  productionPerSecond,
  raidArmies,
  lootShares,
  recallReinforcements,
  sendReinforcements,
  splitTroopLosses,
  resolveRaid,
  ruinCost,
  relativeSize,
  type PlayerState,
  type RaidContext,
} from "./engine";

const T0 = 1_700_000_000_000;
const NOW = T0 + 10 * RAID_COOLDOWN_MS;
const world = { stageCompletedAt: [] };

function player(extra: Partial<PlayerState> = {}): PlayerState {
  return { ...newPlayerState(T0), lastUpdate: NOW, lastClickAt: NOW, troops: { chevalier: 20 }, ...extra };
}

const ctx = (extra: Partial<RaidContext> = {}): RaidContext => ({
  now: NOW,
  attackerId: "a",
  victimId: "v",
  victimRate: 10,
  rng: () => 0.5, // tirages fixes : seules les fractions de plus de 50 % tuent
  ...extra,
});

describe("raids", () => {
  it("vole 25 % du stock non sécurisé quand l'attaquant écrase la garde", () => {
    const secured = 10 * SECURED_SECONDS;
    const r = resolveRaid(player({ stone: 50_000 }), player({ troops: {}, stone: secured + 100_000 }), ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.report).toMatchObject({ success: true, rounds: 1, stolen: 25_000 });
    expect(r.value.attacker.troops.chevalier).toBe(20);
    expect(r.value.attacker.stone).toBe(50_000 + 25_000);
    expect(r.value.victim.stone).toBe(secured + 75_000);
    expect(r.value.attacker.totalPlundered).toBe(25_000);
  });

  it("les 2 dernières heures de production sont à l'abri, mais jamais plus de la moitié du stock", () => {
    // Production 10/s : 72 000 pierres à l'abri, mais au plus la moitié d'un stock de 20 000.
    const r = resolveRaid(player(), player({ troops: {}, stone: 20_000 }), ctx());
    expect(r.ok && r.value.report.stolen).toBe(2_500);
    const big = resolveRaid(player(), player({ troops: {}, stone: 10 * SECURED_SECONDS * 3 }), ctx());
    expect(big.ok && big.value.report.stolen).toBe((10 * SECURED_SECONDS * 2) / 4);
  });

  it("entre joueurs, le butin est plafonné à 2 h de production de l'attaquant", () => {
    const r = resolveRaid(player(), player({ troops: {}, stone: 1e9 }), ctx({ attackerRate: 1 }));
    expect(r.ok && r.value.report.stolen).toBe(7_200);
  });

  it("rançon : 30 % des défenseurs abattus, créée par le jeu, réduite contre une cible plus petite", () => {
    const victim = player({ troops: { milicien: 4 }, stone: 0 });
    const full = resolveRaid(player(), victim, ctx({ relativeSize: 1 }));
    if (!full.ok) throw new Error(full.error);
    expect(full.value.report.ransom).toBe(Math.floor(4 * 200 * 0.3));
    expect(full.value.attacker.stone).toBe(player().stone + full.value.report.ransom);
    const small = resolveRaid(player(), victim, ctx({ relativeSize: 0.25 }));
    expect(small.ok && small.value.report.fairness).toBe(0.5);
    expect(small.ok && small.value.report.ransom).toBe(Math.floor(4 * 200 * 0.3 * 0.5));
    expect(fairness(0.25, true)).toBe(1);
  });

  it("qui repousse un seigneur récupère toutes ses pertes", () => {
    const victim = player({ troops: { piquier: 50 }, defenses: { palissade: 10 } });
    const r = resolveRaid(player({ troops: {} }), victim, ctx({ attackerIsLord: true, attackerArmy: { milicien: 5 } }));
    if (!r.ok) throw new Error(r.error);
    expect(r.value.report.success).toBe(false);
    expect(r.value.victim.troops).toEqual({ piquier: 50 });
    expect(r.value.victim.defenses).toEqual({ palissade: 10 });
  });

  it("un seigneur prend au plus 30 minutes de la production de sa victime", () => {
    const victim = player({ stone: 10_000_000, troops: {} });
    const r = resolveRaid(player({ troops: {} }), victim, ctx({ attackerIsLord: true, attackerArmy: { chevalier: 50 }, victimRate: 10 }));
    if (!r.ok) throw new Error(r.error);
    expect(r.value.report.success).toBe(true);
    expect(r.value.report.stolen).toBe(10 * 30 * 60);
  });

  it("une cible trop petite ne peut pas être attaquée, sauf en revanche ou en guerre", () => {
    const victim = player({ troops: {} });
    expect(resolveRaid(player(), victim, ctx({ relativeSize: 0.05 })).ok).toBe(false);
    expect(resolveRaid(player(), victim, ctx({ relativeSize: 0.05, atWar: true })).ok).toBe(true);
    expect(relativeSize({ army: 10, rate: 50 }, { army: 1000, rate: 100 })).toBe(0.5);
  });

  it("le défenseur battu retrouve la moitié de ses troupes après 30 min d'infirmerie, et ne subit plus de ruines pendant 24 h", () => {
    const victim = player({ troops: { milicien: 4 }, generators: { manoeuvre: 30, tailleur: 30 } });
    const r = resolveRaid(player(), victim, ctx());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.report.success).toBe(true);
    expect(r.value.victim.troops.milicien ?? 0).toBe(0);
    expect(r.value.victim.wounded).toEqual({ milicien: 2 });
    expect(r.value.victim.healAt).toBe(NOW + INFIRMARY_MS);
    expect(settleWounded(r.value.victim, NOW + INFIRMARY_MS).troops.milicien).toBe(2);
    // L'attaquant vainqueur récupère 60 % de ses pertes.
    const lost = r.value.report.attackerLost.chevalier ?? 0;
    expect(r.value.attacker.wounded.chevalier ?? 0).toBe(Math.round(lost * 0.6));
    expect(r.value.victim.ruinImmuneUntil).toBeGreaterThan(NOW);
    const again = resolveRaid(player({ lastRaidAt: 0 }), { ...r.value.victim, shieldUntil: 0 }, ctx({ victimId: "v2" }));
    expect(again.ok && again.value.report.destroyed).toEqual({});
  });

  it("incendie, bouclier et droit de revanche pour la victime", () => {
    const r = resolveRaid(player(), player({ troops: {}, stone: 0 }), ctx());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.victim.burnedUntil).toBe(NOW + BURN_MS);
    expect(r.value.victim.shieldUntil).toBe(NOW + SHIELD_MS);
    expect(r.value.victim.revengeTarget).toBe("a");
    expect(r.value.attacker.lastRaidTarget).toBe("v");
  });

  it("détruit 5 % des bâtiments, au plus un par type, sans toucher aux premiers", () => {
    const victim = player({ troops: {}, generators: { manoeuvre: 30, tailleur: 30, charrette: 5, carriere: 3 } }); // 68 → 3 à détruire
    const r = resolveRaid(player(), victim, ctx());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.report.destroyed).toEqual({ tailleur: 1, manoeuvre: 1 });
    expect(r.value.victim.generators).toMatchObject({ manoeuvre: 29, tailleur: 29, charrette: 5, carriere: 3 });
    expect(r.value.victim.ruins).toEqual({ tailleur: 1, manoeuvre: 1 });
  });

  it("un débutant ne perd jamais de bâtiment", () => {
    const r = resolveRaid(player(), player({ troops: {}, generators: { manoeuvre: 5, tailleur: 4 } }), ctx());
    expect(r.ok && r.value.report.destroyed).toEqual({});
  });

  it("refuse les raids sur bouclier, en double, trop rapprochés ou sans troupes", () => {
    expect(resolveRaid(player(), player({ shieldUntil: NOW + 1 }), ctx()).ok).toBe(false);
    expect(resolveRaid(player({ lastRaidTarget: "v" }), player(), ctx()).ok).toBe(false);
    expect(resolveRaid(player({ lastRaidAt: NOW - 1000 }), player(), ctx()).ok).toBe(false);
    expect(resolveRaid(player({ troops: {} }), player(), ctx()).ok).toBe(false);
  });

  it("la revanche est possible sans délai et double le butin", () => {
    const attacker = player({ lastRaidAt: NOW - 1000, lastRaidTarget: "v", revengeTarget: "v", revengeUntil: NOW + 1000 });
    const r = resolveRaid(attacker, player({ troops: {}, stone: 10 * SECURED_SECONDS * 3 }), ctx());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.report).toMatchObject({ revenge: true, stolen: 10 * SECURED_SECONDS * 2 * 0.4 });
    expect(r.value.attacker.revengeTarget).toBeNull();
  });

  it("un raid repoussé ne vole rien, ne donne pas de bouclier, et l'attaquant perd ses hommes", () => {
    const victim = player({ troops: {}, stone: 1e6, defenses: { tour: 5 } });
    const r = resolveRaid(player({ troops: { milicien: 2 } }), victim, ctx());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.report.success).toBe(false);
    expect(r.value.victim.stone).toBe(1e6);
    expect(r.value.victim.shieldUntil).toBe(0);
    expect(r.value.attacker.troops.milicien).toBeUndefined();
    expect(r.value.attacker.lastRaidTarget).toBe("v");
  });

  it("les troupes du défenseur meurent, ses fortifications se relèvent en grande partie, ses gardes reviennent", () => {
    const r = resolveRaid(player(), player({ troops: { milicien: 1 }, defenses: { palissade: 10 } }), ctx());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.report.success).toBe(true);
    // Le milicien tombé passe à l'infirmerie (la moitié, arrondie au plus proche).
    expect(r.value.victim.wounded).toEqual({ milicien: 1 });
    // Les palissades abattues se relèvent à 70 % : peu de pertes pour de bon.
    const lostWalls = r.value.report.defenderLost.palissade ?? 0;
    expect((r.value.victim.defenses.palissade ?? 0) + lostWalls).toBe(10);
    expect(lostWalls).toBeLessThanOrEqual(3);
    expect(r.value.report.defenderLost.milicien).toBe(1);
    expect(defenseArmy(r.value.victim).garde).toBe(GUARDS_PER_DOMAIN);
  });

  it("un seigneur qui riposte peut frapper deux fois de suite le même joueur", () => {
    const lord = player({ troops: {}, lastRaidTarget: "v" });
    const base = { attackerIsLord: true, attackerArmy: { chevalier: 5 } };
    expect(resolveRaid(lord, player({ troops: {} }), ctx(base)).ok).toBe(false);
    expect(resolveRaid(lord, player({ troops: {} }), ctx({ ...base, allowRepeat: true })).ok).toBe(true);
  });

  it("un seigneur pillé n'a qu'un court bouclier", () => {
    const r = resolveRaid(player(), player({ troops: {} }), ctx({ defenderArmy: { garde: 3 } }));
    if (!r.ok) throw new Error(r.error);
    expect(r.value.victim.shieldUntil).toBe(NOW + LORD_SHIELD_MS);
  });

  it("un seigneur attaque avec son armée sans jamais la perdre", () => {
    const lord = player({ troops: {} });
    const r = resolveRaid(lord, player({ troops: {}, defenses: { tour: 1 } }), ctx({ attackerIsLord: true, attackerArmy: { chevalier: 5 } }));
    if (!r.ok) throw new Error(r.error);
    expect(r.value.attacker.troops).toEqual({});
  });
});

describe("batailles", () => {
  const rng = () => seededRng(42);

  it("les piquiers arrêtent les chevaliers à prix égal", () => {
    expect(battle({ chevalier: 3 }, { piquier: 20 }, rng()).success).toBe(false);
    expect(estimateChance({ chevalier: 3 }, { piquier: 20 })).toBeLessThan(0.1);
  });

  it("les chevaliers chargent les arbalétriers, qui fauchent les miliciens", () => {
    expect(estimateChance({ chevalier: 3 }, { arbaletrier: 13 })).toBeGreaterThan(0.9);
    expect(estimateChance({ milicien: 25 }, { arbaletrier: 10 })).toBeLessThan(0.1);
    expect(estimateChance({ arbaletrier: 10 }, { milicien: 25 })).toBeGreaterThan(0.9);
  });

  it("les béliers ouvrent les murailles", () => {
    const wall = { tour: 4, muraille: 1, garde: 3 };
    expect(estimateChance({ milicien: 45 }, wall)).toBeLessThan(estimateChance({ milicien: 30, belier: 1 }, wall));
  });

  it("la revanche augmente les dégâts", () => {
    const a = { milicien: 15 };
    const d = { tour: 2, garde: 3 };
    expect(estimateChance(a, d, { attackBonus: 1.5 })).toBeGreaterThan(estimateChance(a, d));
  });

  it("les palissades protègent les tours, sans pouvoir tenir seules", () => {
    expect(estimateChance({ milicien: 40 }, { tour: 4, palissade: 30, garde: 3 })).toBeLessThan(estimateChance({ milicien: 40 }, { tour: 4, garde: 3 }));
    expect(estimateChance({ milicien: 10 }, { palissade: 30 })).toBe(1);
  });

  it("la bataille dure au plus 4 rounds", () => {
    expect(battle({ belier: 1 }, { muraille: 1, garde: 1 }, rng()).rounds).toBeLessThanOrEqual(4);
  });

  it("l'estimation est stable d'un appel à l'autre", () => {
    const a = { milicien: 12, arbaletrier: 3 };
    const d = { tour: 2, piquier: 4, garde: 3 };
    expect(estimateChance(a, d)).toBe(estimateChance(a, d));
  });
});

describe("alliances et renforts", () => {
  it("on ne pille pas un allié", () => {
    const r = resolveRaid(player(), player({ troops: {} }), ctx({ allied: true }));
    expect(r.ok).toBe(false);
  });

  it("envoyer puis rappeler des renforts", () => {
    const sent = sendReinforcements(player({ troops: { piquier: 10 } }), player({ troops: {} }), "a", "piquier", 4);
    if (!sent.ok) throw new Error(sent.error);
    expect(sent.value.sender.troops).toEqual({ piquier: 6 });
    expect(sent.value.host.stationed).toEqual({ a: { piquier: 4 } });
    expect(defenseArmy(sent.value.host)).toMatchObject({ piquier: 4 });
    expect(sendReinforcements(player({ troops: { piquier: 1 } }), player(), "a", "piquier", 2).ok).toBe(false);
    const back = recallReinforcements(sent.value.sender, sent.value.host, "a");
    if (!back.ok) throw new Error(back.error);
    expect(back.value.owner.troops).toEqual({ piquier: 10 });
    expect(back.value.host.stationed).toEqual({});
  });

  it("les renforts partent en raid avec l'allié et partagent les pertes au prorata", () => {
    const host = player({ troops: { milicien: 6 }, stationed: { ally: { milicien: 4 } } });
    const split = splitTroopLosses(host, { milicien: 5 });
    expect(split.byOwner).toEqual({ "": { milicien: 3 }, ally: { milicien: 2 } });
    expect(split.troops).toEqual({ milicien: 3 });
    expect(split.stationed).toEqual({ ally: { milicien: 2 } });
    expect(splitTroopLosses(host, { milicien: 10 }).stationed).toEqual({});
  });
});

describe("butin partagé", () => {
  it("les alliés reçoivent une part du butin au prorata de la valeur de leurs renforts", () => {
    // 10 chevaliers à soi (20 000) et 10 chez soi d'un allié (20 000) : moitié-moitié.
    const attacker = player({ stone: 0, troops: { chevalier: 10 }, stationed: { ally: { chevalier: 10 } } });
    const r = resolveRaid(attacker, player({ troops: {}, stone: 80_000 }), ctx());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.report.stolen).toBe(10_000);
    expect(r.value.report.allyShares).toEqual({ ally: 5_000 });
    expect(r.value.attacker.stone).toBe(5_000);
    expect(r.value.attacker.totalPlundered).toBe(5_000);
    expect(lootShares(player({ troops: { milicien: 3 } }), 1_000)).toEqual({});
  });
});

describe("guerres et forteresse", () => {
  it("en guerre, les boucliers tombent mais le repos et la règle de cible restent", () => {
    const victim = player({ troops: {}, shieldUntil: NOW + 3_600_000 });
    expect(resolveRaid(player(), victim, ctx()).ok).toBe(false);
    expect(resolveRaid(player(), victim, ctx({ atWar: true })).ok).toBe(true);
    expect(resolveRaid(player({ lastRaidAt: NOW - 1000 }), victim, ctx({ atWar: true })).ok).toBe(false);
    expect(resolveRaid(player({ lastRaidTarget: "v" }), victim, ctx({ atWar: true })).ok).toBe(false);
  });

  it("tenir la forteresse donne +20 % de production", () => {
    const s = player({ generators: { tailleur: 10 } });
    expect(productionPerSecond({ ...s, fortress: true }, world, 0)).toBeCloseTo(productionPerSecond(s, world, 0) * 1.2);
  });
});

describe("espions", () => {
  it("de loin, les armées sont arrondies (sauf les gardes)", () => {
    expect([1, 3, 7, 8, 12, 15, 37, 150, 0].map(fuzzyCount)).toEqual([5, 5, 5, 10, 10, 20, 40, 200, 0]);
    expect(fuzzyArmy({ milicien: 37, garde: 3 })).toEqual({ milicien: 40, garde: 3 });
  });

  it("le risque d'être repéré dépend de l'écart de niveau et de la distance, plus des tours", () => {
    expect(spyRisk(0, 0)).toBeCloseTo(0.5);
    expect(spyRisk(2, 5)).toBeCloseTo(0.4);
    expect(spyRisk(10, 0)).toBeCloseTo(0.05);
    expect(spyRisk(-10, 10)).toBeCloseTo(0.95);
    expect(sabotageChance(0)).toBeCloseTo(0.5);
    expect(sabotageChance(-9)).toBeCloseTo(0.1);
    expect(sabotageChance(3)).toBeCloseTo(0.8);
  });

  it("l'espion voyage vite, une minute au moins", () => {
    expect(spyTravelMs(0)).toBeGreaterThanOrEqual(60_000);
    expect(spyTravelMs(10)).toBeGreaterThan(spyTravelMs(2));
  });

  it("la recherche Espionnage monte de 1 à 10 et coûte 60 h de production en tout", () => {
    let total = 0;
    let s = { ...player(), stone: 1e15 };
    for (let n = 1; n <= 10; n++) {
      total += researchCost(s, "espionnage", 1);
      const r = startResearch(s, "espionnage", NOW + n * 1e9, 0, 1);
      if (!r.ok) throw new Error(r.error);
      s = advance(r.value, NOW + (n + 1) * 1e9 - 1, world);
    }
    expect(s.spyLevel).toBe(10);
    expect(total / 3600).toBeGreaterThan(59);
    expect(total / 3600).toBeLessThan(62);
    expect(startResearch(s, "espionnage", NOW + 2e10, 0, 1).ok).toBe(false);
  });

  it("un espion coûte une minute de production, 200 pierres au moins", () => {
    expect(spyCost(player(), world, NOW)).toBe(200);
    expect(spyCost(player({ generators: { tailleur: 100 } }), world, NOW)).toBe(6_240); // 100 tailleurs : deux tranches de maîtrise, +4 %
  });
});

describe("troupes et défenses", () => {
  it("acheter des troupes ou des fortifications coûte de la pierre", () => {
    const r = buyArmy(player({ troops: { milicien: 10 }, stone: 1000 }), "unit", "milicien", 3);
    expect(r.ok && r.value.troops.milicien).toBe(13);
    expect(r.ok && r.value.stone).toBe(400);
    expect(buyArmy(player({ stone: 100 }), "defense", "palissade", 1).ok).toBe(false);
    expect(buyArmy(player({ stone: 1e6 }), "defense", "donjon", 1).ok).toBe(false);
  });

  it("la valeur d'une armée additionne troupes et fortifications", () => {
    expect(armyWorth(player({ troops: { milicien: 2 }, defenses: { palissade: 2 } }))).toBe(700);
  });

  it("l'armée d'un seigneur se compose selon son budget et ses goûts", () => {
    expect(armyFromBudget(1_800, { chevalier: 0.5, arbaletrier: 0.3, milicien: 0.2 })).toEqual({ arbaletrier: 1, milicien: 6 });
    expect(armyFromBudget(30_000, { chevalier: 0.5, arbaletrier: 0.3, milicien: 0.2 })).toEqual({ chevalier: 7, arbaletrier: 18, milicien: 35 });
    expect(armyFromBudget(1_000, {})).toEqual({});
  });
});

describe("incendie et ruines", () => {
  it("l'incendie divise la production par deux, puis la production reprend", () => {
    const s = player({ generators: { tailleur: 10 }, lastUpdate: T0, burnedUntil: T0 + 10_000 });
    expect(advance(s, T0 + 20_000, world).stone).toBeCloseTo(50 + 100);
  });

  it("frapper la pierre écourte l'incendie", () => {
    const s = player({ burnedUntil: NOW + 60_000, lastClickAt: NOW - 2000 });
    const { state } = applyClicks(s, 20, NOW, world);
    expect(state.burnedUntil).toBe(NOW + 60_000 - 20_000);
  });

  it("une ruine se rebâtit à moitié prix et les ruines comptent dans le prix du neuf", () => {
    const s = player({ stone: 1e6, generators: { tailleur: 9 }, ruins: { tailleur: 1 } });
    expect(generatorCost(s, "tailleur")).toBe(generatorCost(player({ generators: { tailleur: 10 } }), "tailleur"));
    const cost = ruinCost(s, "tailleur");
    const r = rebuildRuin(s, "tailleur");
    if (!r.ok) throw new Error(r.error);
    expect(r.value.generators.tailleur).toBe(10);
    expect(r.value.ruins.tailleur).toBe(0);
    expect(r.value.stone).toBe(1e6 - cost);
    expect(rebuildRuin(r.value, "tailleur").ok).toBe(false);
  });
});

describe("coup de pouce en défense", () => {
  it("les défenseurs d'un joueur distancé encaissent moins", () => {
    const attacker = player({ troops: { chevalier: 10 } });
    const plain = raidArmies(attacker, player(), { victimId: "v", now: NOW });
    const helped = raidArmies(attacker, player({ catchUp: 0.6 }), { victimId: "v", now: NOW });
    expect(plain.attackBonus).toBe(1);
    expect(helped.attackBonus).toBeCloseTo(1 / 1.6);
  });
});

describe("espionnage, deuxième livraison", () => {
  it("la fausse rumeur double ou divise l'armée affichée, pendant 2 h", () => {
    const base = { ...player(), stone: 1e9 };
    const fort = buyRumor(base, "fort", 10, NOW);
    if (!fort.ok) throw new Error(fort.error);
    expect(rumorArmy(fort.value, { milicien: 10 }, NOW + 1)).toEqual({ milicien: 20 });
    expect(rumorArmy(fort.value, { milicien: 10 }, NOW + 2 * 3_600_000 + 1)).toEqual({ milicien: 10 });
    const faible = buyRumor(base, "faible", 10, NOW);
    if (!faible.ok) throw new Error(faible.error);
    expect(rumorArmy(faible.value, { milicien: 10 }, NOW + 1)).toEqual({ milicien: 5 });
    expect(buyRumor(base, "moyen", 10, NOW).ok).toBe(false);
  });

  it("le contre-espionnage dure 6 h et se prolonge au rachat", () => {
    const r = buyCounter({ ...player(), stone: 1e9 }, 10, NOW);
    if (!r.ok) throw new Error(r.error);
    expect(counterActive(r.value, NOW + 6 * 3_600_000 - 1)).toBe(true);
    expect(counterActive(r.value, NOW + 6 * 3_600_000 + 1)).toBe(false);
    const again = buyCounter(r.value, 10, NOW + 1000);
    if (!again.ok) throw new Error(again.error);
    expect(again.value.counterUntil).toBe(NOW + 12 * 3_600_000);
    expect(r.value.stone).toBe(1e9 - 1800);
  });

  it("le sabotage du grenier et du guet ne demande ni académie ni recherche", () => {
    const target = player();
    expect(sabotageBlocker(target, NOW, undefined, "academie")).not.toBeNull();
    expect(sabotageBlocker(target, NOW, undefined, "grenier")).toBeNull();
    const g = applySabotage(target, NOW, "grenier");
    expect(g.granaryCutUntil).toBe(NOW + 2 * 3_600_000);
    expect(sabotageBlocker(g, NOW + 1, undefined, "guet")).not.toBeNull();
    expect(applySabotage(target, NOW, "guet").blindUntil).toBe(NOW + 3_600_000);
  });

  it("un grenier saboté ne met que la moitié à l'abri", () => {
    const full = lootOf(100_000, 1, false, {});
    const cut = lootOf(100_000, 1, false, { securedFactor: 0.5 });
    expect(cut).toBeGreaterThan(full);
  });
});
