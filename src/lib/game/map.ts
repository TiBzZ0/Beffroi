// T1 : placement sur la carte du royaume.
import { BELFRY_POS, FORTRESS_POS, LORD_POSITIONS, MAP_SIZE, mapDistance, type MapPos } from "./config";

/** Cases fixes : beffroi, forteresse et seigneurs. */
export function fixedPlaces(): MapPos[] {
  return [BELFRY_POS, FORTRESS_POS, ...Object.values(LORD_POSITIONS)];
}

/** T6 : case du colosse, tirée une fois pour toutes, à 4 cases au moins de tout joueur. */
export function colossusPos(seed: number, players: MapPos[]): MapPos {
  const taken = [...fixedPlaces(), ...players];
  const free: MapPos[] = [];
  for (let x = 1; x <= MAP_SIZE; x++)
    for (let y = 1; y <= MAP_SIZE; y++) {
      const c: MapPos = [x, y];
      if (taken.some((t) => mapDistance(t, c) < 1)) continue;
      if (players.some((p) => mapDistance(p, c) < 4)) continue;
      free.push(c);
    }
  const pool = free.length > 0 ? free : [[1, 8] as MapPos];
  return pool[Math.abs(Math.imul(seed, 2654435761)) % pool.length];
}
