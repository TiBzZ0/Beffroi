import { describe, expect, it } from "vitest";
import { LORD_POSITIONS, LORDS, MAP_SIZE, mapDistance, BELFRY_POS, type MapPos } from "./config";
import { fixedPlaces, pickSpawn } from "./map";
import { seededRng } from "./battle";

describe("carte du royaume (T1)", () => {
  it("place chaque seigneur sur une case à lui, dans la grille", () => {
    const spots = LORDS.map((l) => LORD_POSITIONS[l.key]);
    expect(spots.every(Boolean)).toBe(true);
    expect(new Set(spots.map((p) => p.join(","))).size).toBe(LORDS.length);
    for (const p of fixedPlaces()) for (const c of p) expect(c >= 1 && c <= MAP_SIZE).toBe(true);
  });
  it("place 20 joueurs à 2 cases au moins des autres lieux, près du centre", () => {
    const rng = seededRng(7);
    const taken: MapPos[] = [...fixedPlaces()];
    for (let i = 0; i < 20; i++) {
      const p = pickSpawn(taken, rng)!;
      expect(p).not.toBeNull();
      if (i < 10) {
        expect(mapDistance(p, BELFRY_POS)).toBeLessThanOrEqual(5);
        for (const t of taken) expect(mapDistance(p, t)).toBeGreaterThanOrEqual(2);
      }
      taken.push(p);
    }
  });
});
