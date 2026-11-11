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

describe("événements sur la carte (T6)", () => {
  it("la caravane va d'un bord à l'autre", async () => {
    const { caravanPath, caravanPos } = await import("./map");
    for (let seed = 1; seed < 50; seed++) {
      const { from, to } = caravanPath(seed);
      const onEdge = (p: readonly number[]) => p.some((c) => c === 1 || c === MAP_SIZE);
      expect(onEdge(from) && onEdge(to)).toBe(true);
      expect(caravanPos(seed, 0, 100, 50)).toEqual([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]);
    }
  });
  it("le colosse se pose à 4 cases au moins de tout joueur", async () => {
    const { colossusPos } = await import("./map");
    const players: MapPos[] = [[8, 6], [6, 9], [10, 10], [9, 12]];
    for (let seed = 1; seed < 30; seed++) {
      const p = colossusPos(seed, players);
      for (const q of players) expect(mapDistance(p, q)).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("décor de la carte", () => {
  it("est stable et laisse les lieux dégagés", async () => {
    const { buildTerrain } = await import("./map-terrain");
    const places: [number, number][] = [[8, 8], [8, 4], [5, 5], [11, 11], [2, 12]];
    const a = buildTerrain(places, 15);
    const b = buildTerrain(places, 15);
    expect(a.trees.length).toBe(b.trees.length);
    expect(a.trees.length).toBeGreaterThan(100);
    expect(a.bridges.length).toBeGreaterThan(0);
    for (const t of a.trees) for (const p of places) expect(Math.hypot(t.x - p[0], t.y - p[1])).toBeGreaterThanOrEqual(0.6);
  });
});
