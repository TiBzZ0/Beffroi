import { describe, expect, it } from "vitest";
import { EVENT_WEIGHTS, MERCHANT_PRICE_SECONDS, type EventKind } from "./config";
import { pickNextEvent } from "./events";
import { advance, buyFromMerchant, buyUpgrade, catchVein, eventActive, generatorCost, newPlayerState, rateAt, raidBlocker, scheduleVein, type PlayerState } from "./engine";
import { UPGRADES } from "./config";

const world = { stageCompletedAt: [] };
const T = 1_800_000_000_000;
const withEvent = (s: PlayerState, kind: EventKind): PlayerState => ({ ...s, eventMods: [{ kind, from: T - 1000, until: T + 3_600_000 }], lastUpdate: T });

describe("tirage des événements", () => {
  it("ne répète jamais le même et respecte à peu près les poids", () => {
    const counts: Record<string, number> = {};
    let last: EventKind = "caravane";
    for (let i = 0; i < 4000; i++) {
      const next = pickNextEvent(last, i * 7919 + 1);
      expect(next).not.toBe(last);
      counts[next] = (counts[next] ?? 0) + 1;
      last = next;
    }
    for (const k of Object.keys(EVENT_WEIGHTS)) expect(counts[k] ?? 0).toBeGreaterThan(0);
    expect(counts.caravane).toBeGreaterThan(counts.treve);
  });
});

describe("événements sans combat", () => {
  const base = { ...newPlayerState(T), stone: 1e12, generators: { manoeuvre: 10 } } as PlayerState;
  it("V3 : la foire baisse le prix des ateliers et des savoirs", () => {
    const fair = withEvent(base, "foire");
    expect(generatorCost(fair, "manoeuvre", 1)).toBeLessThan(generatorCost({ ...base, lastUpdate: T }, "manoeuvre", 1));
    const u = UPGRADES[0];
    const before = buyUpgrade({ ...base, lastUpdate: T }, u.id);
    const after = buyUpgrade(fair, u.id);
    if (before.ok && after.ok) expect(after.value.stone - before.value.stone).toBeCloseTo(u.cost * 0.2, -1);
  });
  it("V6 : la trêve bloque les raids et donne +25 % de production", () => {
    const truce = withEvent(base, "treve");
    expect(eventActive(truce, "treve", T)).toBe(true);
    expect(raidBlocker(truce, truce, { attackerId: "a", victimId: "b", now: T, victimRate: 1 } as never)).toMatch(/Trêve/);
    expect(rateAt(truce, world, T) / rateAt({ ...base }, world, T)).toBeCloseTo(1.25, 5);
  });
  it("V5 : les veines arrivent trois fois plus vite pendant la pluie d'étoiles", () => {
    const stars = scheduleVein({ ...withEvent(base, "etoiles"), veinAt: 0 }, T, () => 0.5);
    const plain = scheduleVein({ ...base, veinAt: 0 }, T, () => 0.5);
    expect(stars.veinAt - T).toBeLessThan((plain.veinAt - T) / 2.9);
    void catchVein;
  });
  it("V15 : le marchand vend un bonus une seule fois, pour 30 minutes de production", () => {
    const m = advance(withEvent(base, "marchand"), T, world);
    const r = buyFromMerchant(m, "production", 42, T, world);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(m.stone - r.value.stone).toBeCloseTo(rateAt(m, world, T) * MERCHANT_PRICE_SECONDS, -2);
    expect(r.value.boostProdUntil).toBeGreaterThan(T);
    expect(buyFromMerchant(r.value, "safe", 42, T, world).ok).toBe(false);
    expect(buyFromMerchant(m, "repair", 42, T, world).ok).toBe(false);
  });
});
