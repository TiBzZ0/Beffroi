import { describe, expect, it } from "vitest";
import { BURN_MS, GUARDS_PER_DOMAIN, RAID_COOLDOWN_MS, SECURED_SECONDS, SHIELD_MS } from "./config";
import { armyFromBudget, battle, estimateChance, seededRng } from "./battle";
import {
  advance,
  applyClicks,
  armyWorth,
  buyArmy,
  defenseArmy,
  generatorCost,
  newPlayerState,
  rebuildRuin,
  resolveRaid,
  ruinCost,
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

  it("la dernière demi-heure de production est à l'abri, mais jamais plus de la moitié du stock", () => {
    // Production 10/s : 18 000 pierres à l'abri, mais au plus la moitié d'un stock de 20 000.
    const r = resolveRaid(player(), player({ troops: {}, stone: 20_000 }), ctx());
    expect(r.ok && r.value.report.stolen).toBe(2_500);
    const big = resolveRaid(player(), player({ troops: {}, stone: 10 * SECURED_SECONDS + 50_000 }), ctx());
    expect(big.ok && big.value.report.stolen).toBe(12_500);
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
    const r = resolveRaid(attacker, player({ troops: {}, stone: 10 * SECURED_SECONDS + 50_000 }), ctx());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.report).toMatchObject({ revenge: true, stolen: 20_000 });
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
    expect(r.value.victim.troops.milicien).toBeUndefined();
    // 7 palissades abattues, 70 % relevées : 2 perdues pour de bon.
    expect(r.value.victim.defenses.palissade).toBe(8);
    expect(r.value.report.defenderLost).toEqual({ milicien: 1, palissade: 2 });
    expect(defenseArmy(r.value.victim).garde).toBe(GUARDS_PER_DOMAIN);
  });

  it("un seigneur qui riposte peut frapper deux fois de suite le même joueur", () => {
    const lord = player({ troops: {}, lastRaidTarget: "v" });
    const base = { attackerIsLord: true, attackerArmy: { chevalier: 5 } };
    expect(resolveRaid(lord, player({ troops: {} }), ctx(base)).ok).toBe(false);
    expect(resolveRaid(lord, player({ troops: {} }), ctx({ ...base, allowRepeat: true })).ok).toBe(true);
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
