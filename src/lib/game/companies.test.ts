import { describe, expect, it } from "vitest";
import { buyArmy, newPlayerState, sendTroops, type PlayerState } from "./engine";
import { allocation, buildFort, combatLevels, createCompany, lockedMen, recruit, settleArmy, startTraining, trainMs, COMPANY_CAP, RECRUIT_MS } from "./companies";

const T0 = Date.parse("2026-11-24T10:00:00Z");
const model = (extra: Partial<PlayerState> = {}): PlayerState => ({ ...newPlayerState(T0), stone: 1e9, companyModel: true, ...extra });
const ok = <S,>(r: { ok: true; value: S } | { ok: false; error: string }): S => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("Compagnies", () => {
  it("rien ne s'active hors du modèle (saison 0)", () => {
    const s0 = { ...newPlayerState(T0), stone: 1e6 };
    expect(createCompany(s0, "piquier", T0).ok).toBe(false);
    expect(buyArmy(s0, "unit", "piquier", 1).ok).toBe(true);
    expect(buyArmy(model(), "unit", "piquier", 1).ok).toBe(false);
    expect(settleArmy(s0, T0 + 1e9)).toBe(s0);
  });

  it("deux compagnies au départ, les hommes arrivent un par un", () => {
    let s = ok(createCompany(model(), "piquier", T0));
    s = ok(createCompany(s, "chevalier", T0));
    expect(createCompany(s, "milicien", T0).ok).toBe(false);
    const id = s.companies![0].id;
    s = ok(recruit(s, id, 1000, T0));
    expect(s.recruits![0].n).toBe(COMPANY_CAP.piquier);
    const later = settleArmy(s, T0 + 10 * RECRUIT_MS.piquier + 1);
    expect(later.troops.piquier).toBe(10);
    expect(allocation(later).get(id)).toEqual({ men: 10, home: 10, queued: COMPANY_CAP.piquier - 10 });
    expect(settleArmy(s, T0 + 3_600_000).troops.piquier).toBe(COMPANY_CAP.piquier);
  });

  it("l'entraînement retient la compagnie et renforce le combat", () => {
    let s = ok(createCompany(model({ troops: { piquier: 600 } }), "piquier", T0));
    const id = s.companies![0].id;
    const before = combatLevels(s).piquier ?? 0;
    s = ok(startTraining(s, id, 10, T0));
    expect(lockedMen(s, T0 + 1).piquier).toBe(600);
    expect(sendTroops({ ...s, lastUpdate: T0 + 1 }, { piquier: 1 }).ok).toBe(false);
    s = settleArmy(s, T0 + trainMs({ train: 0 }));
    expect(s.companies![0].train).toBe(1);
    expect(combatLevels(s).piquier).toBeGreaterThan(before);
  });

  it("les fortifications suivent leur niveau et se relèvent", () => {
    let s = ok(buildFort(model(), "palissade", 10, T0));
    s = settleArmy(s, T0 + 3_600_000);
    expect(s.fortLevels?.palissade).toBe(1);
    expect(s.defenses.palissade).toBe(100);
    expect(settleArmy({ ...s, defenses: { palissade: 12 } }, T0 + 3_600_001).defenses.palissade).toBe(100);
  });
});
