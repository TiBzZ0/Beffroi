import { describe, expect, it } from "vitest";
import { landMarch, newPlayerState, recallMarch, resolveRaid, sendTroops, travelMs, type March, type PlayerState } from "./engine";

const T = 1_800_000_000_000;

describe("trajets (T2 à T4)", () => {
  it("suit les exemples de la spécification", () => {
    expect(travelMs({ piquier: 10 }, 4)).toBe(6 * 60_000);
    expect(Math.round(travelMs({ piquier: 10, belier: 2 }, 4) / 1000)).toBe(520);
    expect(Math.round(travelMs({ chevalier: 5 }, 10) / 1000)).toBe(520);
    expect(travelMs({ piquier: 1 }, 0)).toBe(3 * 60_000);
    expect(travelMs({ belier: 1 }, 30)).toBe(20 * 60_000);
  });

  it("retire les troupes envoyées, les rend au retour avec le butin", () => {
    const s = { ...newPlayerState(T), troops: { piquier: 10, milicien: 4 } } as PlayerState;
    expect(sendTroops(s, { piquier: 11 }).ok).toBe(false);
    expect(sendTroops(s, { palissade: 1 } as never).ok).toBe(false);
    const r = sendTroops(s, { piquier: 6 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.state.troops).toEqual({ piquier: 4, milicien: 4 });
    const m: March = { id: "a", kind: "raid", target: "x", troops: { piquier: 5 }, departAt: T, arriveAt: T + 6e5, status: "back", returnAt: T + 12e5, revealed: false, warned: true, loot: 1000, ransom: 200 };
    const landed = landMarch({ ...r.value.state, marches: [m] }, "a");
    expect(landed.troops).toEqual({ piquier: 9, milicien: 4 });
    expect(landed.stone).toBe(r.value.state.stone + 1200);
    expect(landed.marches).toEqual([]);
  });

  it("rappelle une armée en autant de temps qu'elle a marché", () => {
    const m: March = { id: "a", kind: "raid", target: "x", troops: { piquier: 5 }, departAt: T, arriveAt: T + 6e5, status: "out", returnAt: 0, revealed: false, warned: false, loot: 0, ransom: 0 };
    const s = { ...newPlayerState(T), marches: [m] } as PlayerState;
    const r = recallMarch(s, "a", T + 1e5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.marches?.[0]).toMatchObject({ status: "back", returnAt: T + 2e5 });
    expect(recallMarch(s, "a", T + 7e5).ok).toBe(false);
  });

  it("une armée en route ne crédite pas le butin au combat", () => {
    const attacker = { ...newPlayerState(T), troops: {} } as PlayerState;
    const victim = { ...newPlayerState(T), stone: 1e9, troops: {} } as PlayerState;
    const r = resolveRaid(attacker, victim, { now: T, attackerId: "a", victimId: "v", victimRate: 1, attackerArmy: { chevalier: 500 }, marching: true, allowRepeat: true, rng: () => 0.5 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.report.success).toBe(true);
    expect(r.value.report.stolen).toBeGreaterThan(0);
    expect(r.value.attacker.stone).toBe(attacker.stone);
  });
});

describe("filon géant (V9)", () => {
  it("rapporte 3 minutes par tranche de 10 minutes, 30 minutes au plus", async () => {
    const { mineReward } = await import("./engine");
    const m: March = { id: "a", kind: "event", target: "mine:1", troops: { piquier: 1 }, departAt: T - 6e5, arriveAt: T, status: "camp", returnAt: T + 7_200_000, revealed: true, warned: true, loot: 0, ransom: 0 };
    expect(mineReward(m, T + 25 * 60_000, 10)).toBe(10 * 2 * 180);
    expect(mineReward(m, T + 7_200_000, 10)).toBe(10 * 1800);
    expect(mineReward(m, T + 9_000_000, 10)).toBe(10 * 1800);
  });
});
