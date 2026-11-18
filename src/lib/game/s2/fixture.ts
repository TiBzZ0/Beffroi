// Pour les tests : une carte de saison 2 fixe et un joueur posé avec sa première carrière.
import { afterAll, beforeAll } from "vitest";
import { setS2Geometry, setStagesNow } from "../config";
import { setIronArmy } from "../companies";
import { newPlayerState, type PlayerState } from "../engine";
import { castleBlocker, generateMap, type Pos } from "./map";
import { firstConcessionSites, newS2State, takeConcession } from "./economy";
import { setS2Map } from "./rules";

export const MAP = generateMap(42);

/** Active les règles de la saison 2 pour le fichier de tests en cours. */
export function useS2(): void {
  beforeAll(() => {
    setS2Geometry(true);
    setIronArmy(true);
    setS2Map(MAP);
  });
  afterAll(() => {
    setS2Geometry(false);
    setIronArmy(false);
    setS2Map(null);
    setStagesNow(0);
  });
}

export function freeCell(): Pos {
  for (let y = 2; y < 39; y++) for (let x = 2; x < 39; x++) if (!castleBlocker(MAP, [x, y], [])) return [x, y];
  throw new Error("aucune case libre");
}

/** Joueur de la saison 2 : château posé, une carrière, l'armée en compagnies. */
export function s2Player(now: number, extra: Partial<PlayerState> = {}): PlayerState {
  const castle = freeCell();
  const site = firstConcessionSites(MAP, castle, () => 0)[0];
  const s2 = { ...newS2State(now), castle, at: now };
  const r = takeConcession(s2, { map: MAP, stageConcessions: 0 }, site, { taken: () => 0 }, now);
  if (!r.ok) throw new Error(r.error);
  return { ...newPlayerState(now), companyModel: true, seasonStart: now, s2: r.value, ...extra };
}
