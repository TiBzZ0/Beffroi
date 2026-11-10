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

/** T6 : la caravane traverse la carte en ligne droite, d'un bord à l'autre, pendant toute sa durée. */
export function caravanPath(seed: number): { from: MapPos; to: MapPos } {
  const h = Math.abs(Math.imul(seed, 2246822519));
  const a = 1 + (h % MAP_SIZE);
  const b = 1 + (Math.floor(h / MAP_SIZE) % MAP_SIZE);
  const horizontal = h % 2 === 0;
  const flip = Math.floor(h / 7) % 2 === 0;
  const from: MapPos = horizontal ? [1, a] : [a, 1];
  const to: MapPos = horizontal ? [MAP_SIZE, b] : [b, MAP_SIZE];
  return flip ? { from: to, to: from } : { from, to };
}

export function caravanPos(seed: number, startsAt: number, endsAt: number, t: number): MapPos {
  const { from, to } = caravanPath(seed);
  const f = Math.min(1, Math.max(0, (t - startsAt) / Math.max(1, endsAt - startsAt)));
  return [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f];
}
