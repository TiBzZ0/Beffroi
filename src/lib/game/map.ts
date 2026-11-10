// T1 : placement sur la carte du royaume.
import { BELFRY_POS, FORTRESS_POS, LORD_POSITIONS, MAP_MIN_GAP, MAP_SIZE, MAP_SPAWN_RADIUS, mapDistance, type MapPos } from "./config";

/** Cases fixes : beffroi, forteresse et seigneurs. */
export function fixedPlaces(): MapPos[] {
  return [BELFRY_POS, FORTRESS_POS, ...Object.values(LORD_POSITIONS)];
}

/** Tire une case libre à 2 cases au moins de tout lieu, près du centre (on élargit si la couronne est pleine). */
export function pickSpawn(taken: MapPos[], rng: () => number = Math.random): MapPos | null {
  for (const radius of [MAP_SPAWN_RADIUS, MAP_SPAWN_RADIUS + 2, MAP_SIZE]) {
    for (const gap of [MAP_MIN_GAP, 1]) {
      const free: MapPos[] = [];
      for (let x = 1; x <= MAP_SIZE; x++)
        for (let y = 1; y <= MAP_SIZE; y++) {
          const c: MapPos = [x, y];
          if (mapDistance(c, BELFRY_POS) > radius) continue;
          if (taken.some((t) => mapDistance(t, c) < gap)) continue;
          free.push(c);
        }
      if (free.length > 0) return free[Math.floor(rng() * free.length)];
    }
  }
  return null;
}

