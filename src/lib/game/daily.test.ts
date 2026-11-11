import { describe, expect, it } from "vitest";
import { DAILY_FAMILIES, DAILY_QUESTS, DAILY_REWARD_SECONDS } from "./config";
import { chestBonus, claimDaily, dailyDay, dailyStart, openChest, rollDaily, swapDaily, type DailyContext, type DailyHolder } from "./daily";

const ctx: DailyContext = { shareSize: 400, troops: 10, allies: 2, upgradesLeft: 5, levels: 3 };
const T = dailyStart(20_000) + 3_600_000;
const familyOf = (id: string) => DAILY_QUESTS.find((q) => q.id === id)?.family;
const holder = (daily: DailyHolder["daily"]): DailyHolder => ({ stone: 0, totalProduced: 0, daily });

describe("quêtes du jour", () => {
  it("change de jour à 4 h UTC", () => {
    const d = dailyDay(T);
    expect(dailyDay(dailyStart(d) - 1)).toBe(d - 1);
    expect(dailyDay(dailyStart(d))).toBe(d);
  });

  it("tire une quête par famille et garde le tirage dans la journée", () => {
    const d = rollDaily(null, T, 123, ctx);
    expect(d.quests.map((q) => familyOf(q.id))).toEqual([...DAILY_FAMILIES]);
    expect(rollDaily(d, T + 3_600_000, 999, ctx)).toBe(d);
    expect(d.quests.find((q) => q.id === "don")?.goal ?? 100).toBe(100);
  });

  it("ne tire jamais une quête impossible", () => {
    const poor: DailyContext = { shareSize: null, troops: 0, allies: 0, upgradesLeft: 0, levels: 0 };
    for (let s = 0; s < 300; s++) {
      const ids = rollDaily(null, T, s, poor).quests.map((q) => q.id);
      for (const bad of ["don", "savoir", "seigneur", "renforts"]) expect(ids).not.toContain(bad);
    }
  });

  it("donne 20 minutes de production par quête accomplie, une seule fois", () => {
    const d = rollDaily(null, T, 5, ctx);
    const q = d.quests[2];
    const counts = { [q.id]: q.goal };
    expect(claimDaily(holder(d), 2, {}, 3, 10).ok).toBe(false);
    const r = claimDaily(holder(d), 2, counts, 3, 10);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.reward).toBe(10 * DAILY_REWARD_SECONDS);
    expect(claimDaily(r.value.state, 2, counts, 3, 10).ok).toBe(false);
  });

  it("permet un seul échange, dans la même famille", () => {
    const d = rollDaily(null, T, 7, ctx);
    const r = swapDaily(holder(d), 0, 42, ctx);
    if (!r.ok) throw new Error(r.error);
    const q = r.value.daily!.quests[0];
    expect(q.id).not.toBe(d.quests[0].id);
    expect(familyOf(q.id)).toBe(familyOf(d.quests[0].id));
    expect(swapDaily(r.value, 1, 43, ctx).ok).toBe(false);
  });

  it("ouvre le coffre une fois les trois prises, et la série monte jusqu'à +20 %", () => {
    expect(chestBonus(1)).toBeCloseTo(0.1);
    expect(chestBonus(5)).toBeCloseTo(0.2);
    expect(chestBonus(9)).toBeCloseTo(0.2);
    let daily = rollDaily(null, T, 1, ctx);
    expect(openChest(holder(daily), T).ok).toBe(false);
    let streak = 0;
    for (let i = 0; i < 6; i++) {
      const now = T + i * 86_400_000;
      daily = rollDaily(daily, now, i, ctx);
      daily = { ...daily, quests: daily.quests.map((q) => ({ ...q, claimed: true })) };
      const r = openChest(holder(daily), now);
      if (!r.ok) throw new Error(r.error);
      daily = r.value.state.daily!;
      streak = daily.streak;
      expect(r.value.state.dailyBoostUntil).toBe(now + 4 * 3_600_000);
    }
    expect(streak).toBe(5);
    // Deux jours manqués : deux crans de moins, puis la série repart de là.
    const later = T + 8 * 86_400_000;
    daily = rollDaily(daily, later, 1, ctx);
    expect(daily.streak).toBe(3);
    daily = { ...daily, quests: daily.quests.map((q) => ({ ...q, claimed: true })) };
    const r = openChest(holder(daily), later);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.state.daily!.streak).toBe(4);
  });
});
