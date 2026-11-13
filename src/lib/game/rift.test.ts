import { describe, expect, it } from "vitest";
import { battle, seededRng } from "./battle";
import { addWounded, advance, newPlayerState, type PlayerState } from "./engine";
import { allocation, createCompany } from "./companies";
import { applyRiftFight, floorAlterations, floorValue, riftFightBlocker, riftFloor, riftOf, riftReturn, riftSend, riftWeek, settleRift, RIFT_REST_MS } from "./rift";

const T0 = Date.parse("2026-11-24T10:00:00Z");
const ok = <S,>(r: { ok: true; value: S } | { ok: false; error: string }): S => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const withCompanies = (): PlayerState => {
  let s: PlayerState = { ...newPlayerState(T0), stone: 1e9, companyModel: true, troops: { piquier: 600, arbaletrier: 500 } };
  s = ok(createCompany(s, "piquier", T0));
  return ok(createCompany(s, "arbaletrier", T0));
};

describe("Faille", () => {
  it("la semaine commence le lundi à 4 h, heure de Paris", () => {
    // Lundi 23 novembre 2026, 3 h 00 UTC = 4 h 00 à Paris.
    expect(riftWeek(Date.parse("2026-11-23T02:59:00Z")).key).toBe("2026-11-16");
    expect(riftWeek(Date.parse("2026-11-23T03:00:00Z")).key).toBe("2026-11-23");
    const w = riftWeek(T0);
    expect(w.start).toBe(Date.parse("2026-11-23T03:00:00Z"));
    expect(w.end).toBe(Date.parse("2026-11-30T03:00:00Z"));
  });

  it("étages fixes pour la semaine, sans Horde et Champions ensemble", () => {
    expect(riftFloor("2026-11-23", 7)).toEqual(riftFloor("2026-11-23", 7));
    for (let f = 1; f < 200; f++) {
      const a = floorAlterations("2026-11-23", f);
      expect(a.length).toBeGreaterThan(0);
      expect(a.includes("horde") && a.includes("champions")).toBe(false);
    }
    expect(floorValue(2)).toBeGreaterThan(floorValue(1));
    expect(riftFloor("2026-11-23", 10).guardian).toBe(true);
  });

  it("une expédition part, se bat, rentre avec ses hommes", () => {
    const s = withCompanies();
    const pq = s.companies![0].id;
    let t = ok(riftSend(s, [pq], 600_000, T0));
    expect(t.troops.piquier ?? 0).toBe(0);
    expect(allocation(t).get(pq)?.men).toBe(600);
    expect(riftSend(t, [s.companies![1].id], 600_000, T0).ok).toBe(false);
    t = settleRift(t, T0 + 600_000, addWounded);
    expect(riftOf(t, T0 + 600_000).exp?.status).toBe("wait");
    expect(riftFightBlocker(t, T0 + 600_000)).toBeNull();
    const e = riftOf(t, T0 + 600_000).exp!;
    const f = riftFloor(riftWeek(T0).key, e.floor);
    const result = battle(e.troops, f.army, seededRng(1), {});
    t = applyRiftFight(t, f, { ...result, success: true }, 0.6, T0 + 600_000);
    expect(riftOf(t, T0 + 600_000).best).toBe(1);
    expect(riftOf(t, T0 + 600_000).exp?.floor).toBe(2);
    t = ok(riftReturn(t, T0 + 700_000));
    const home = settleRift(t, T0 + 1_400_000, addWounded);
    expect(riftOf(home, T0 + 1_400_000).exp).toBeNull();
    expect((home.troops.piquier ?? 0) + (home.wounded.piquier ?? 0)).toBeGreaterThan(0);
    // La compagnie se repose 4 heures.
    expect(riftSend(home, [pq], 600_000, T0 + 1_400_000).ok).toBe(false);
    expect(riftSend(home, [pq], 600_000, T0 + RIFT_REST_MS + 1).ok).toBe(true);
  });

  it("sans ordre, l'expédition rentre seule ; la semaine suivante repart de l'étage 1", () => {
    const s = withCompanies();
    let t = ok(riftSend(s, [s.companies![0].id], 60_000, T0));
    t = { ...t, rift: { ...t.rift!, best: 6 } };
    const later = advance({ ...t, lastUpdate: T0 }, T0 + 3 * 3_600_000, { stageCompletedAt: [] });
    expect(later.rift?.exp).toBeNull();
    expect(later.troops.piquier).toBe(600);
    expect(riftOf(later, Date.parse("2026-12-01T10:00:00Z")).best).toBe(0);
  });

  it("rien en saison 0", () => {
    const s0 = { ...newPlayerState(T0), troops: { piquier: 600 } };
    expect(riftSend(s0, ["x"], 1, T0).ok).toBe(false);
  });
});
