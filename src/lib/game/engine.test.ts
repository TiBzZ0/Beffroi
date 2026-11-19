import { describe, expect, it } from "vitest";
import { STAGE_MIN_SIZE } from "./config";
import {
  advance,
  catchUpBonus,
  contribute,
  newPlayerState,
  payTithe,
  stagePerk,
  openShare,
  recordGift,
  setTithe,
  productionPerSecond,
  raidBlocker,
  rateAt,
  sabotageBlocker,
  stageSize,
  type PlayerState,
  type WorldState,
} from "./engine";
import { formatNumber, formatRate } from "./format";
import { s2Player, useS2 } from "./s2/fixture";

const T0 = 1_700_000_000_000;
const H = 3_600_000;
const noWorld: WorldState = { stageCompletedAt: [] };

function withStone(stone: number): PlayerState {
  return { ...newPlayerState(T0), stone };
}

describe("calcul paresseux", () => {
  useS2();
  it("les concessions produisent avec le temps, et le calcul coupé en deux tombe juste", () => {
    const p = s2Player(T0);
    const after = advance(p, T0 + 6 * H, noWorld);
    expect(after.stone).toBeGreaterThan(p.stone);
    expect(advance(advance(p, T0 + 3 * H, noWorld), T0 + 6 * H, noWorld).stone).toBeCloseTo(after.stone, 0);
  });

  it("ne recule jamais dans le temps", () => {
    const p = { ...s2Player(T0), stone: 50 };
    expect(advance(p, T0 - 10_000, noWorld)).toEqual(p);
  });

  it("le château ne produit rien sans concession", () => {
    expect(productionPerSecond(newPlayerState(T0), noWorld, 0)).toBe(0);
  });

  it("applique le bonus d'héritage", () => {
    const p = s2Player(T0);
    expect(productionPerSecond(p, { stageCompletedAt: [], legacyBonus: 0.1 }, 0)).toBeCloseTo(productionPerSecond(p, noWorld, 0) * 1.1);
  });
});

describe("chantier commun", () => {
  it("la contribution ne peut dépasser le stock", () => {
    const r = contribute(withStone(42.7), 1000);
    expect(r.ok && r.value.stone).toBeCloseTo(0.7);
    expect(r.ok && r.value.totalContributed).toBe(42);
  });

  it("refuse une contribution nulle", () => {
    expect(contribute(withStone(0.5), 10).ok).toBe(false);
    expect(contribute(withStone(50), 0).ok).toBe(false);
  });

  it("une étape vaut 4 h de la production cumulée des joueurs actifs", () => {
    expect(stageSize([1000, 500])).toBe(1500 * 4 * 3600);
    expect(stageSize([])).toBe(STAGE_MIN_SIZE);
    expect(stageSize([Number.NaN, -3, 1])).toBe(STAGE_MIN_SIZE);
  });
});

describe("dîme automatique", () => {
  useS2();
  it("prélève sa part de la pierre livrée pour le chantier", () => {
    const p = { ...s2Player(T0), tithe: 0.1 };
    const after = advance(p, T0 + 6 * H, noWorld);
    expect(after.titheOwed).toBeGreaterThan(0);
    expect(after.titheOwed! / (after.stone - p.stone + after.titheOwed!)).toBeCloseTo(0.1);
    const paid = payTithe(after);
    expect(paid.paid).toBe(Math.floor(after.titheOwed!));
    expect(paid.state.totalContributed).toBe(paid.paid);
  });

  it("se règle de 0 à 20 % par pas de 1 %", () => {
    const s = newPlayerState(T0);
    expect(setTithe(s, 12).ok && setTithe(s, 12)).toMatchObject({ value: { tithe: 0.12, titheSet: true } });
    expect(setTithe(s, 21).ok).toBe(false);
    expect(setTithe(s, 2.5).ok).toBe(false);
  });
});

describe("paliers de don", () => {
  useS2();
  it("la part vaut 4 h de production, mesurée à l'ouverture de l'étape", () => {
    const p = s2Player(T0);
    const rate = productionPerSecond(p, noWorld, 0);
    const s = openShare(p, 2, noWorld, T0);
    expect(s.share?.stage).toBe(2);
    expect(s.share?.size).toBeCloseTo(rate * 4 * 3600, 0);
    expect(openShare(s, 2, noWorld, T0 + 1)).toBe(s);
  });

  it("25, 50 et 100 % versés : +2 % de production et 5, 10, 15 écus", () => {
    const p = s2Player(T0);
    const s = openShare(p, 0, noWorld, T0);
    const size = s.share!.size;
    const a = recordGift(s, size * 0.3);
    expect(a).toMatchObject({ tiers: 1, ecus: 5 });
    const b = recordGift(a.state, size);
    expect(b).toMatchObject({ tiers: 2, ecus: 25 });
    expect(b.state.donorTiers).toBe(3);
    expect(recordGift(b.state, size).tiers).toBe(0);
    expect(productionPerSecond(b.state, noWorld, 0)).toBeCloseTo(productionPerSecond(p, noWorld, 0) * 1.06);
  });

  it("Q4 : 10, 25 et 50 % sur les étapes de 12 h et plus, rattrapés sans nouveau don", () => {
    const p = s2Player(T0);
    const s = openShare(p, 8, noWorld, T0);
    const size = s.share!.size;
    expect(recordGift(s, size * 0.12)).toMatchObject({ tiers: 1, ecus: 5 });
    const old = { ...s, share: { ...s.share!, given: size * 0.3, tiers: 1 } };
    expect(recordGift(old, 0)).toMatchObject({ tiers: 1, ecus: 10 });
    const short = openShare(p, 0, noWorld, T0);
    expect(recordGift(short, short.share!.size * 0.12).tiers).toBe(0);
  });
});

describe("couvre-feu (saison 1, retiré)", () => {
  const DAY = 86_400_000;
  const midnight = Math.floor(T0 / DAY) * DAY + 10 * DAY;

  it("une ancienne plage de couvre-feu ne bloque plus ni raid ni sabotage", () => {
    const sleeper = { ...newPlayerState(midnight), curfew: { start: 0 }, academy: 3 };
    const raider = { ...newPlayerState(midnight), troops: { milicien: 10 } };
    const at = midnight + 3_600_000;
    const ctx = { now: at, attackerId: "a", victimId: "b", victimRate: 1 };
    expect(raidBlocker(raider, sleeper, ctx) ?? "").not.toMatch(/couvre-feu/);
    expect(sabotageBlocker(sleeper, at, raider) ?? "").not.toMatch(/couvre-feu/);
  });
});


describe("lots du chantier", () => {
  useS2();
  it("prime de lot : +10 % jusqu'à la fin de l'étape suivante", () => {
    const p = s2Player(T0);
    const s = { ...p, lotBonusUntilStage: 2 };
    expect(productionPerSecond(s, noWorld, 1)).toBeCloseTo(productionPerSecond(p, noWorld, 1) * 1.1);
    expect(productionPerSecond(s, noWorld, 2)).toBeCloseTo(productionPerSecond(p, noWorld, 2));
  });

  it("maître d'œuvre : +15 % de production pendant 24 h", () => {
    const p = s2Player(T0);
    const s = { ...p, masterBonuses: [{ kind: "production" as const, from: T0 + 10_000, until: T0 + 20_000 }] };
    expect(rateAt(s, noWorld, T0 + 15_000) / rateAt(p, noWorld, T0 + 15_000)).toBeCloseTo(1.15);
    expect(rateAt(s, noWorld, T0 + 25_000)).toBeCloseTo(rateAt(p, noWorld, T0 + 25_000));
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
    const base = s2Player(T0);
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
  it("l'horloge vaut 12 h et le beffroi légendaire 48 h de production (saison 1)", async () => {
    const { stageSize: size } = await import("./engine");
    const { stageHours } = await import("./config");
    expect(stageHours(5)).toBe(4);
    expect(stageHours(6)).toBe(12);
    expect(stageHours(7)).toBe(48);
    expect(size([1e6], stageHours(6))).toBe(3 * size([1e6], stageHours(5)));
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
