import { describe, expect, it } from "vitest";
import { LORD_POSITIONS, LORDS, mapDistance, type MapPos } from "./config";
import { colossusPos } from "./map";

describe("lieux fixes", () => {
  it("chaque seigneur a une case à lui", () => {
    const spots = LORDS.map((l) => LORD_POSITIONS[l.key]);
    expect(spots.every(Boolean)).toBe(true);
    expect(new Set(spots.map((p) => p.join(","))).size).toBe(LORDS.length);
  });
});

describe("colosse (T6)", () => {
  it("se pose à 4 cases au moins de tout joueur", () => {
    const players: MapPos[] = [[8, 6], [6, 9], [10, 10], [9, 12]];
    for (let seed = 1; seed < 30; seed++) {
      const p = colossusPos(seed, players);
      for (const q of players) expect(mapDistance(p, q)).toBeGreaterThanOrEqual(4);
    }
  });
});
