import { describe, expect, it } from "vitest";
import { seasonRewards } from "./legacy";
import { defenseArmy, extraSecured, newPlayerState, productionPerSecond, rateAt } from "./engine";

describe("H1 : écus de clôture", () => {
  it("étapes du beffroi pour les donateurs, podium partout, fidélité", () => {
    const rows = seasonRewards({
      players: [
        { id: "a", donor: true, allianceId: 1 },
        { id: "b", donor: false, allianceId: 1 },
        { id: "c", donor: true, allianceId: null },
      ],
      stagesDone: 11,
      podiums: [
        { category: "plunderer", alliance: false, ids: ["c", "a"] },
        { category: "war", alliance: true, ids: ["1"] },
      ],
      days: new Map([["a", 5], ["b", 2], ["c", 3]]),
    });
    const by = new Map(rows.map((r) => [r.user_id, r]));
    // 8 étapes du beffroi (les embellissements ont déjà payé) × 10, 2e pillard 20, guerre 30, fidélité 5.
    expect(by.get("a")?.total).toBe(80 + 20 + 30 + 5);
    expect(by.get("b")?.total).toBe(30);
    expect(by.get("c")?.total).toBe(80 + 30 + 5);
  });
});

describe("H2 : héritage", () => {
  it("carrier, départ lancé, cave et garde", () => {
    const base = { ...newPlayerState(0), generators: { tailleur: 10 } } as ReturnType<typeof newPlayerState>;
    const s = { ...base, legacy: { carrier: 4, depart: 1, cave: 2, garde: 3 }, seasonStart: 1 };
    const world = { stageCompletedAt: [] };
    expect(productionPerSecond(s, world, 0) / productionPerSecond(base, world, 0)).toBeCloseTo(1.08);
    expect(rateAt(s, world, 1000) / productionPerSecond(s, world, 0)).toBeCloseTo(1.5);
    expect(rateAt(s, world, 25 * 3_600_000) / productionPerSecond(s, world, 0)).toBeCloseTo(1);
    expect(extraSecured(s, 0) - extraSecured(base, 0)).toBe(1800);
    expect((defenseArmy(s).garde ?? 0) - (defenseArmy(base).garde ?? 0)).toBe(3);
  });
});
