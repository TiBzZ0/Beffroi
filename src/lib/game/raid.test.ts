import { describe, expect, it } from "vitest";
import { BURN_MS, RAID_COOLDOWN_MS, SECURED_SECONDS, SHIELD_MS } from "./config";
import {
  advance,
  applyClicks,
  generatorCost,
  newPlayerState,
  raidCost,
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
  return { ...newPlayerState(T0), lastUpdate: NOW, lastClickAt: NOW, ...extra };
}

const ctx = (extra: Partial<RaidContext> = {}): RaidContext => ({
  now: NOW,
  attackerId: "a",
  victimId: "v",
  attackerRate: 10,
  victimRate: 10,
  ...extra,
});

describe("raids", () => {
  it("vole 10 % du stock non sécurisé et fait payer l'attaquant", () => {
    const secured = 10 * SECURED_SECONDS;
    const r = resolveRaid(player({ stone: 50_000 }), player({ stone: secured + 100_000 }), ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.report.stolen).toBe(10_000);
    expect(r.value.report.cost).toBe(raidCost(10));
    expect(r.value.attacker.stone).toBe(50_000 - raidCost(10) + 10_000);
    expect(r.value.victim.stone).toBe(secured + 90_000);
    expect(r.value.attacker.totalPlundered).toBe(10_000);
  });

  it("le stock sécurisé ne peut pas être volé", () => {
    const r = resolveRaid(player({ stone: 50_000 }), player({ stone: 10 * SECURED_SECONDS - 1 }), ctx());
    expect(r.ok && r.value.report.stolen).toBe(0);
  });

  it("incendie, bouclier et droit de revanche pour la victime", () => {
    const r = resolveRaid(player({ stone: 50_000 }), player({ stone: 0 }), ctx());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.victim.burnedUntil).toBe(NOW + BURN_MS);
    expect(r.value.victim.shieldUntil).toBe(NOW + SHIELD_MS);
    expect(r.value.victim.revengeTarget).toBe("a");
    expect(r.value.attacker.lastRaidTarget).toBe("v");
  });

  it("détruit 5 % des bâtiments, au plus un par type, sans toucher aux premiers", () => {
    const victim = player({ generators: { manoeuvre: 30, tailleur: 30, charrette: 5, carriere: 3 } }); // 68 → 3 à détruire
    const r = resolveRaid(player({ stone: 1e6 }), victim, ctx());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.report.destroyed).toEqual({ tailleur: 1, manoeuvre: 1 });
    expect(r.value.victim.generators).toMatchObject({ manoeuvre: 29, tailleur: 29, charrette: 5, carriere: 3 });
    expect(r.value.victim.ruins).toEqual({ tailleur: 1, manoeuvre: 1 });
  });

  it("un débutant ne perd jamais de bâtiment", () => {
    const r = resolveRaid(player({ stone: 1e6 }), player({ generators: { manoeuvre: 5, tailleur: 4 } }), ctx());
    expect(r.ok && r.value.report.destroyed).toEqual({});
  });

  it("refuse les raids sur bouclier, en double ou trop rapprochés", () => {
    expect(resolveRaid(player({ stone: 1e6 }), player({ shieldUntil: NOW + 1 }), ctx()).ok).toBe(false);
    expect(resolveRaid(player({ stone: 1e6, lastRaidTarget: "v" }), player(), ctx()).ok).toBe(false);
    expect(resolveRaid(player({ stone: 1e6, lastRaidAt: NOW - 1000 }), player(), ctx()).ok).toBe(false);
    expect(resolveRaid(player({ stone: 10 }), player(), ctx()).ok).toBe(false);
  });

  it("la revanche est gratuite, sans délai, et double le butin", () => {
    const attacker = player({ stone: 0, lastRaidAt: NOW - 1000, lastRaidTarget: "v", revengeTarget: "v", revengeUntil: NOW + 1000 });
    const r = resolveRaid(attacker, player({ stone: 10 * SECURED_SECONDS + 1000 }), ctx());
    if (!r.ok) throw new Error(r.error);
    expect(r.value.report).toMatchObject({ revenge: true, cost: 0, stolen: 200 });
    expect(r.value.attacker.revengeTarget).toBeNull();
  });

  it("les seigneurs ne paient pas et un seigneur bien gardé coûte plus cher", () => {
    expect(resolveRaid(player({ stone: 0 }), player(), ctx({ attackerIsLord: true })).ok).toBe(true);
    expect(raidCost(10, 3)).toBe(3 * raidCost(10));
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
