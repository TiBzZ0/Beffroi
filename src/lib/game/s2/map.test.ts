import { describe, expect, it } from "vitest";
import { castleBlocker, cheb, generateMap, inCentre, isFair, lordPlaces, RANKS, REGIONS, S2_SIZE } from "./map";

describe("S2 : carte de saison", () => {
  it("tire des cartes équitables, déterministes, conformes aux règles", () => {
    const t0 = Date.now();
    for (let seed = 1; seed <= 6; seed++) {
      const m = generateMap(seed);
      expect(generateMap(seed)).toEqual(m);
      expect(m.sites).toHaveLength(18);
      expect(m.sites.reduce((a, s) => a + s.places, 0)).toBe(102);
      expect(isFair(m.sites)).toBe(true);
      for (const s of m.sites) expect(s.places - lordPlaces(m, s.id)).toBeGreaterThanOrEqual(2);
      expect(m.lords).toHaveLength(20);
      expect(m.lords.reduce((a, l) => a + l.conc.length, 0)).toBe(26);
      for (const r of Object.keys(RANKS)) expect(m.lords.filter((l) => l.rank === r)).toHaveLength(RANKS[r as "duc"].count);
      const out = m.sites.filter((s) => !s.centre);
      for (const a of out) for (const b of out) if (a !== b) expect(cheb(a.pos, b.pos)).toBeGreaterThanOrEqual(a.type === b.type ? 10 : 6);
      const counts = REGIONS.map((_, i) => m.regions.flat().filter((r) => r === i).length);
      expect((Math.max(...counts) - Math.min(...counts)) / Math.min(...counts)).toBeLessThanOrEqual(0.3);
      expect(m.regions.flat().filter((r) => r === -1).length).toBe(Array.from({ length: S2_SIZE * S2_SIZE }, (_, i) => inCentre([i % S2_SIZE, Math.floor(i / S2_SIZE)])).filter(Boolean).length);
    }
    expect(Date.now() - t0).toBeLessThan(30_000);
  }, 60_000);

  it("pose du château : hors du centre, à 2 cases de tout", () => {
    const m = generateMap(3);
    expect(castleBlocker(m, [20, 20], [])).toMatch(/centre/);
    expect(castleBlocker(m, m.sites[5].pos, [])).toMatch(/site/);
    expect(castleBlocker(m, [m.lords[0].pos[0] + 1, m.lords[0].pos[1]], [])).toMatch(/seigneur/);
  });
});
